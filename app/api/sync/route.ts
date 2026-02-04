import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanGmailForInvoices, calculateFileHash, getGmailClient, getOrCreateLabel, applyLabelToMessage, archiveMessage } from '@/lib/gmail'
import { getDriveClient } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'
import { scanInboxFolder } from '@/lib/drive-inbox'
import { ingestDocument } from '@/lib/ingestion'

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

    // Get or create Gmail label for synced emails
    let gmailLabelId: string | null = null
    if (settings.gmail_sync_label && settings.gmail_sync_label.trim()) {
      try {
        console.log(`[LABEL] Attempting to get/create label: "${settings.gmail_sync_label}"`)
        const gmail = await getGmailClient(providerToken)
        gmailLabelId = await getOrCreateLabel(gmail, settings.gmail_sync_label)
        console.log(`[LABEL] Successfully got/created label with ID: ${gmailLabelId}`)
      } catch (error) {
        console.error('[LABEL] Failed to get/create Gmail label:', error)
        // Continue sync even if label creation fails
      }
    } else {
      console.log('[LABEL] No Gmail label configured, skipping labeling')
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

        // Use Ingest Service
        const result = await ingestDocument(
          {
            user,
            settings,
            gmailAccount,
            providerToken
          },
          attachment.data,
          attachment.filename,
          {
            emailMessageId: attachment.messageId,
            subject: attachment.subject,
            sender: attachment.sender,
            senderDomain: attachment.senderDomain,
            receivedDate: attachment.receivedDate,
            source: 'gmail',
          }
        )

        // Append logs
        if (result.log) processingLog.push(...result.log)

        if (result.success) {
          if (result.action === 'processed') {
            documentsFound++

            // --- POST-PROCESSING ACTIONS (Label & Archive) ---
            // Step 8: Apply Gmail label to mark as synced
            if (gmailLabelId) {
              processingLog.push(`Attempting to apply label ${gmailLabelId} to message ${attachment.messageId}`)
              try {
                const gmail = await getGmailClient(providerToken)
                await applyLabelToMessage(gmail, attachment.messageId, gmailLabelId)
                processingLog.push(`✓ Gmail label applied to email`)
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                processingLog.push(`⚠ Failed to apply Gmail label: ${errorMsg}`)
              }
            }

            // Step 9: Archive email if enabled
            if (settings.archive_synced_emails) {
              processingLog.push(`Attempting to archive message ${attachment.messageId}`)
              try {
                const gmail = await getGmailClient(providerToken)
                await archiveMessage(gmail, attachment.messageId)
                processingLog.push(`✓ Email archived (removed from inbox)`)
              } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Unknown error'
                processingLog.push(`⚠ Failed to archive email: ${errorMsg}`)
              }
            }

          } else if (result.action === 'duplicate_skipped') {
            duplicatesSkipped++
          }
        } else {
          // Failed
        }

      } catch (error) {
        processingLog.push(`✗ FAILED - ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // --- INBOX FOLDER SYNC ---
    if (settings.inbox_folder_enabled && settings.inbox_folder_id) {
      processingLog.push(`\n=== STARTING INBOX FOLDER SYNC ===`)
      processingLog.push(`Scanning folder ID: ${settings.inbox_folder_id}`)

      try {
        const lastSyncDate = settings.last_inbox_sync_at ? new Date(settings.last_inbox_sync_at) : undefined

        const { documents: inboxDocs, debug: inboxDebug } = await scanInboxFolder(
          providerToken,
          settings.inbox_folder_id,
          lastSyncDate
        )

        processingLog.push(`Scanner Result: Found ${inboxDebug.filesFound} total files`)
        processingLog.push(`Files to process: ${inboxDocs.length}`)

        let inboxDocsProcessed = 0

        if (inboxDocs.length > 0) {
          const drive = await getDriveClient(providerToken)

          // Process inbox documents
          for (let i = 0; i < inboxDocs.length; i++) {
            const doc = inboxDocs[i]
            processingLog.push(`\n--- Processing inbox file ${i + 1}/${inboxDocs.length} ---`)
            processingLog.push(`Filename: ${doc.filename}`)

            try {
              // Use Ingest Service
              const result = await ingestDocument(
                {
                  user,
                  settings,
                  gmailAccount,
                  providerToken
                },
                doc.data,
                doc.filename,
                {
                  emailMessageId: `drive_inbox_${doc.driveFileId}`, // unique fake ID
                  subject: `File from Inbox: ${doc.filename}`,
                  sender: 'Drive Upload',
                  senderDomain: 'drive.google.com',
                  receivedDate: doc.createdDate,
                  source: 'inbox_folder',
                  inboxFileId: doc.driveFileId
                }
              )

              if (result.log) processingLog.push(...result.log)

              if (result.success) {
                if (result.action === 'processed') {
                  documentsFound++
                  inboxDocsProcessed++

                  // Clean up Inbox file (Move behavior)
                  try {
                    await drive.files.delete({ fileId: doc.driveFileId })
                    processingLog.push(`✓ Original file removed from Inbox (Moved)`)
                  } catch (delErr) {
                    processingLog.push(`⚠ WARNING: Failed to remove file from Inbox: ${delErr instanceof Error ? delErr.message : String(delErr)}`)
                  }

                } else if (result.action === 'duplicate_skipped') {
                  duplicatesSkipped++

                  // Clean up duplicates too
                  try {
                    await drive.files.delete({ fileId: doc.driveFileId })
                    processingLog.push(`✓ Duplicate file removed from Inbox (Cleaned up)`)
                  } catch (delErr) {
                    processingLog.push(`⚠ WARNING: Failed to remove duplicate: ${delErr instanceof Error ? delErr.message : String(delErr)}`)
                  }
                }
              }
            } catch (error) {
              processingLog.push(`✗ FAILED inbox file - ${error instanceof Error ? error.message : String(error)}`)
            }
          }

          // Update last sync time
          if (inboxDocsProcessed > 0) {
            await supabase
              .from('user_settings')
              .update({ last_inbox_sync_at: new Date().toISOString() })
              .eq('user_id', user.id)
          }
        }
      } catch (error) {
        processingLog.push(`ERROR in inbox sync: ${error instanceof Error ? error.message : String(error)}`)
      }
    } else {
      processingLog.push(`\n=== SKIPPING INBOX SYNC ===`)
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
