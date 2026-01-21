import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanGmailForInvoices, calculateFileHash } from '@/lib/gmail'
import { classifyDocument } from '@/lib/document-ai'
import { getDriveClient } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'
import { Readable } from 'stream'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get current session with provider token
    const { data: { session } } = await supabase.auth.getSession()

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized - no session' }, { status: 401 })
    }

    const user = session.user

    // Get user settings and Gmail account first
    const [settingsResult, gmailResult] = await Promise.all([
      supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('gmail_accounts')
        .select('*')
        .eq('user_id', user.id)
        .single(),
    ])

    if (settingsResult.error || !settingsResult.data) {
      return NextResponse.json({ error: 'User settings not found', details: settingsResult.error?.message }, { status: 404 })
    }

    if (gmailResult.error || !gmailResult.data) {
      return NextResponse.json({ error: 'Gmail account not found', details: gmailResult.error?.message }, { status: 404 })
    }

    const settings = settingsResult.data
    const gmailAccount = gmailResult.data

    // Get valid access token (will refresh if needed)
    let providerToken: string
    try {
      const tokenResult = await getValidAccessToken(
        gmailAccount.access_token,
        gmailAccount.refresh_token,
        gmailAccount.token_expiry
      )

      providerToken = tokenResult.accessToken

      // Update database if token was refreshed
      if (tokenResult.needsUpdate && tokenResult.newExpiry) {
        await supabase
          .from('gmail_accounts')
          .update({
            access_token: tokenResult.accessToken,
            token_expiry: tokenResult.newExpiry,
          })
          .eq('id', gmailAccount.id)
      }
    } catch (error) {
      return NextResponse.json({
        error: 'Failed to get valid access token',
        details: error instanceof Error ? error.message : 'Please log out and log in again',
        debug: {
          hasAccessToken: !!gmailAccount.access_token,
          hasRefreshToken: !!gmailAccount.refresh_token,
          tokenExpiry: gmailAccount.token_expiry,
        }
      }, { status: 401 })
    }

    if (!settings.drive_folder_id) {
      return NextResponse.json(
        { error: 'Drive folder not configured' },
        { status: 400 }
      )
    }

    // Create sync job
    const { data: syncJob, error: syncJobError } = await supabase
      .from('sync_jobs')
      .insert({
        user_id: user.id,
        gmail_account_id: gmailAccount.id,
        status: 'running',
        sync_from_date: new Date(Date.now() - settings.sync_days_back * 24 * 60 * 60 * 1000).toISOString(),
        sync_to_date: new Date().toISOString(),
      })
      .select()
      .single()

    if (syncJobError || !syncJob) {
      return NextResponse.json({ error: 'Failed to create sync job' }, { status: 500 })
    }

    // Scan Gmail for invoices
    const { attachments, debug } = await scanGmailForInvoices(
      providerToken,
      settings.sync_days_back
    )

    let emailsScanned = attachments.length
    let documentsFound = 0
    let duplicatesSkipped = 0
    const processingLog: string[] = []

    processingLog.push(`=== STARTING DOCUMENT PROCESSING ===`)
    processingLog.push(`Total attachments to process: ${attachments.length}`)

    // Validate we have attachments
    if (attachments.length === 0) {
      processingLog.push(`WARNING: No attachments to process despite PDF extraction showing ${debug.pdfAttachmentsFound}`)
    }

    // Process each attachment
    for (let i = 0; i < attachments.length; i++) {
      const attachment = attachments[i]
      processingLog.push(`\n--- Processing attachment ${i + 1}/${attachments.length} ---`)

      try {
        // Step 1: Log attachment details
        processingLog.push(`Filename: ${attachment.filename}`)
        processingLog.push(`Sender: ${attachment.sender}`)
        processingLog.push(`Subject: ${attachment.subject}`)
        processingLog.push(`Message ID: ${attachment.messageId}`)

        // Step 2: Calculate file hash
        processingLog.push(`Calculating file hash...`)
        const fileHash = calculateFileHash(attachment.data)
        processingLog.push(`Hash: ${fileHash.substring(0, 16)}...`)

        // Step 2.5: Check for duplicates
        processingLog.push(`Checking for duplicates...`)
        const { data: existingDoc } = await supabase
          .from('documents')
          .select('id, filename')
          .eq('user_id', user.id)
          .eq('file_hash', fileHash)
          .single()

        if (existingDoc) {
          processingLog.push(`⊘ DUPLICATE - File already exists: ${existingDoc.filename}`)
          duplicatesSkipped++
          continue
        }
        processingLog.push(`No duplicate found`)

        // Step 3: Classify document
        processingLog.push(`Classifying document...`)
        const classification = await classifyDocument(attachment.data, attachment.filename)
        processingLog.push(`Classification: ${classification.classification} (${classification.confidence})`)

        // Step 4: Get Drive client
        processingLog.push(`Initializing Drive client...`)
        const drive = await getDriveClient(providerToken)
        processingLog.push(`Drive client ready`)

        // Step 5: Find or create Pending Approval folder
        processingLog.push(`Finding Pending Approval folder in ${settings.drive_folder_id}...`)
        const foldersResponse = await drive.files.list({
          q: `name='Pending Approval' and '${settings.drive_folder_id}' in parents and trashed=false`,
          fields: 'files(id, name)',
        })

        let pendingFolderId = foldersResponse.data.files?.[0]?.id

        if (!pendingFolderId) {
          processingLog.push(`Pending Approval folder not found, creating...`)
          const folderResponse = await drive.files.create({
            requestBody: {
              name: 'Pending Approval',
              mimeType: 'application/vnd.google-apps.folder',
              parents: [settings.drive_folder_id],
            },
            fields: 'id',
          })
          pendingFolderId = folderResponse.data.id!
          processingLog.push(`Created folder: ${pendingFolderId}`)
        } else {
          processingLog.push(`Found folder: ${pendingFolderId}`)
        }

        // Step 6: Upload to Drive
        processingLog.push(`Uploading ${attachment.filename} to Drive...`)
        processingLog.push(`File size: ${attachment.data.length} bytes`)

        // Create a readable stream from the buffer
        const stream = new Readable()
        stream.push(attachment.data)
        stream.push(null) // Signal end of stream

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

        if (!fileResponse.data.id) {
          throw new Error('Drive upload failed - no file ID returned')
        }

        processingLog.push(`Uploaded to Drive: ${fileResponse.data.id}`)

        // Step 7: Save to database
        processingLog.push(`Saving to database...`)
        const { error: insertError } = await supabase.from('documents').insert({
          user_id: user.id,
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

        if (insertError) {
          processingLog.push(`DATABASE ERROR: ${insertError.message}`)
          processingLog.push(`Error code: ${insertError.code}`)
          processingLog.push(`Error details: ${JSON.stringify(insertError.details)}`)
          throw new Error(`Database insert failed: ${insertError.message}`)
        }

        documentsFound++
        processingLog.push(`✓ SUCCESS - Document saved to database`)

      } catch (error) {
        processingLog.push(`✗ FAILED - ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    processingLog.push(`\n=== PROCESSING COMPLETE ===`)
    processingLog.push(`Success: ${documentsFound}/${attachments.length}`)

    // Update sync job
    await supabase
      .from('sync_jobs')
      .update({
        status: 'completed',
        emails_scanned: emailsScanned,
        documents_found: documentsFound,
        duplicates_skipped: duplicatesSkipped,
        completed_at: new Date().toISOString(),
      })
      .eq('id', syncJob.id)

    return NextResponse.json({
      success: true,
      emailsScanned,
      documentsFound,
      duplicatesSkipped,
      debug: {
        query: debug.query,
        daysBack: debug.daysBack,
        afterDate: debug.afterDate,
        messagesFound: debug.messagesFound,
        messagesWithoutDateFilter: debug.messagesWithoutDateFilter,
        pdfAttachmentsFound: debug.pdfAttachmentsFound,
      },
      processingLog,
    })
  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to sync emails',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
