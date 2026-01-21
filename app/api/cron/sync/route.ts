import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { scanGmailForInvoices, calculateFileHash } from '@/lib/gmail'
import { classifyDocument } from '@/lib/document-ai'
import { getDriveClient } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'
import { sendNewDocumentsEmail } from '@/lib/email'
import { Readable } from 'stream'

// This endpoint is called by a cron service (Vercel Cron, cron-job.org, etc.)
// Protect it with a secret token to prevent unauthorized access
export async function POST(request: Request) {
  try {
    // Verify cron secret
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Create Supabase admin client (bypasses RLS)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    // Get all users who have auto-sync enabled
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*, gmail_accounts!inner(*)')
      .eq('auto_sync_enabled', true)

    if (!settings || settings.length === 0) {
      return NextResponse.json({ message: 'No users with auto-sync enabled', processed: 0 })
    }

    const results = []

    // Process each user
    for (const userSetting of settings) {
      try {
        const gmailAccount = (userSetting as any).gmail_accounts

        // Get valid access token
        const tokenResult = await getValidAccessToken(
          gmailAccount.access_token,
          gmailAccount.refresh_token,
          gmailAccount.token_expiry
        )

        // Update token if refreshed
        if (tokenResult.needsUpdate && tokenResult.newExpiry) {
          await supabase
            .from('gmail_accounts')
            .update({
              access_token: tokenResult.accessToken,
              token_expiry: tokenResult.newExpiry,
            })
            .eq('id', gmailAccount.id)
        }

        // Create sync job
        const { data: syncJob } = await supabase
          .from('sync_jobs')
          .insert({
            user_id: userSetting.user_id,
            gmail_account_id: gmailAccount.id,
            status: 'running',
            sync_from_date: new Date(Date.now() - userSetting.sync_days_back * 24 * 60 * 60 * 1000).toISOString(),
            sync_to_date: new Date().toISOString(),
          })
          .select()
          .single()

        if (!syncJob) continue

        // Scan Gmail
        const { attachments } = await scanGmailForInvoices(
          tokenResult.accessToken,
          userSetting.sync_days_back
        )

        let documentsFound = 0
        let duplicatesSkipped = 0
        const newDocuments = []

        // Process attachments
        for (const attachment of attachments) {
          try {
            const fileHash = calculateFileHash(attachment.data)

            // Check for duplicates
            const { data: existingDoc } = await supabase
              .from('documents')
              .select('id')
              .eq('user_id', userSetting.user_id)
              .eq('file_hash', fileHash)
              .single()

            if (existingDoc) {
              duplicatesSkipped++
              continue
            }

            // Classify document
            const classification = await classifyDocument(attachment.data, attachment.filename)

            // Upload to Drive
            const drive = await getDriveClient(tokenResult.accessToken)

            // Find or create Pending Approval folder
            const foldersResponse = await drive.files.list({
              q: `name='Pending Approval' and '${userSetting.drive_folder_id}' in parents and trashed=false`,
              fields: 'files(id, name)',
            })

            let pendingFolderId = foldersResponse.data.files?.[0]?.id

            if (!pendingFolderId) {
              const folderResponse = await drive.files.create({
                requestBody: {
                  name: 'Pending Approval',
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: [userSetting.drive_folder_id],
                },
                fields: 'id',
              })
              pendingFolderId = folderResponse.data.id!
            }

            // Upload file
            const stream = new Readable()
            stream.push(attachment.data)
            stream.push(null)

            const fileResponse = await drive.files.create({
              requestBody: {
                name: attachment.filename,
                parents: [pendingFolderId],
              },
              media: {
                mimeType: attachment.mimeType,
                body: stream,
              },
              fields: 'id, webViewLink',
            })

            // Save to database
            const { data: newDoc, error: insertError } = await supabase
              .from('documents')
              .insert({
                user_id: userSetting.user_id,
                gmail_account_id: gmailAccount.id,
                email_message_id: attachment.messageId,
                file_hash: fileHash,
                subject: attachment.subject,
                sender: attachment.sender,
                sender_domain: attachment.senderDomain,
                received_date: attachment.receivedDate.toISOString(),
                filename: attachment.filename,
                original_classification: classification.classification,
                final_classification: classification.classification,
                confidence_score: classification.confidence,
                status: 'pending',
                drive_file_id: fileResponse.data.id,
                drive_folder_path: 'Pending Approval',
              })
              .select()
              .single()

            if (!insertError && newDoc) {
              documentsFound++
              newDocuments.push(newDoc)
            }
          } catch (error) {
            // Continue processing other attachments
            continue
          }
        }

        // Update sync job
        await supabase
          .from('sync_jobs')
          .update({
            status: 'completed',
            emails_scanned: attachments.length,
            documents_found: documentsFound,
            duplicates_skipped: duplicatesSkipped,
            completed_at: new Date().toISOString(),
          })
          .eq('id', syncJob.id)

        // Send email notification if enabled and new documents found
        if (userSetting.email_notifications_enabled && newDocuments.length > 0) {
          const { data: user } = await supabase.auth.admin.getUserById(userSetting.user_id)

          if (user?.user?.email) {
            await sendNewDocumentsEmail(
              user.user.email,
              newDocuments,
              userSetting.drive_folder_id
            )
          }
        }

        results.push({
          userId: userSetting.user_id,
          documentsFound,
          duplicatesSkipped,
          emailSent: userSetting.email_notifications_enabled && newDocuments.length > 0,
        })
      } catch (error) {
        results.push({
          userId: userSetting.user_id,
          error: error instanceof Error ? error.message : 'Unknown error',
        })
      }
    }

    return NextResponse.json({
      success: true,
      processed: settings.length,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
