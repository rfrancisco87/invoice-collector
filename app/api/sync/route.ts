import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanGmailForInvoices, calculateFileHash, getGmailClient, getOrCreateLabel, applyLabelToMessage, archiveMessage } from '@/lib/gmail'
import { sendPdfToWebhook } from '@/lib/webhook'
import { getDriveClient } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'
import { scanInboxFolder } from '@/lib/drive-inbox'
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

        // Step 3: Get Drive client
        processingLog.push(`Initializing Drive client...`)
        const drive = await getDriveClient(providerToken)
        processingLog.push(`Drive client ready`)

        // Step 4: Find or create Pending Approval folder
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

        // Step 5: Upload to Drive
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

        // Step 6: Process with webhook (if configured)
        let webhookData = null
        let webhookError = null
        let classification: 'invoice' | 'credit_note' | 'unclassified' = 'unclassified'

        if (settings.webhook_url && settings.webhook_url.trim()) {
          processingLog.push(`Sending to webhook for processing...`)
          try {
            const response = await sendPdfToWebhook(
              attachment.data,
              attachment.filename,
              settings.webhook_url
            )
            webhookData = response

            // Determine classification from webhook response
            // supplier_invoice -> invoice, credit_note -> credit_note
            if (response.document_type === 'supplier_invoice') {
              classification = 'invoice'
            } else if (response.document_type === 'credit_note') {
              classification = 'credit_note'
            } else {
              // Skip documents that are not invoices or credit notes (e.g., bank statements)
              processingLog.push(`⊘ SKIPPED - Document type "${response.document_type}" is not an invoice or credit note`)
              continue
            }

            processingLog.push(`Webhook processed: ${response.document_type}`)
            processingLog.push(`Invoice #: ${response.invoice_number || 'N/A'}`)
            processingLog.push(`Supplier: ${response.supplier_name || 'N/A'}`)
            processingLog.push(`Total: ${response.invoice_total || 'N/A'} ${response.currency || ''}`)
          } catch (error) {
            webhookError = error instanceof Error ? error.message : 'Unknown webhook error'
            processingLog.push(`⚠ Webhook failed: ${webhookError}`)
            processingLog.push(`⊘ SKIPPED - Cannot classify document without webhook response`)
            continue
          }
        } else {
          processingLog.push(`No webhook URL configured, skipping webhook processing`)
          processingLog.push(`⊘ SKIPPED - Webhook required to classify documents`)
          continue
        }

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
          original_classification: classification,
          final_classification: classification,
          confidence_score: webhookData ? 1.0 : 0.5,
          status: 'pending',
          drive_file_id: fileResponse.data.id,
          drive_folder_path: 'Pending Approval',
          // Webhook data fields
          invoice_number: webhookData?.invoice_number || null,
          issue_date: webhookData?.issue_date || null,
          supplier_name: webhookData?.supplier_name || null,
          supplier_vat_number: webhookData?.supplier_vat_number || null,
          total_without_vat: webhookData?.total_without_vat ? parseFloat(webhookData.total_without_vat) : null,
          total_vat: webhookData?.total_vat ? parseFloat(webhookData.total_vat) : null,
          invoice_total: webhookData?.invoice_total ? parseFloat(webhookData.invoice_total) : null,
          currency: webhookData?.currency || null,
          numb_pages: webhookData?.numb_pages || null,
          document_type: webhookData?.document_type || null,
          webhook_processed_at: webhookData ? new Date().toISOString() : null,
          webhook_error: webhookError,
        })

        if (insertError) {
          processingLog.push(`DATABASE ERROR: ${insertError.message}`)
          processingLog.push(`Error code: ${insertError.code}`)
          processingLog.push(`Error details: ${JSON.stringify(insertError.details)}`)
          throw new Error(`Database insert failed: ${insertError.message}`)
        }

        documentsFound++
        processingLog.push(`✓ SUCCESS - Document saved to database`)

        // Step 8: Apply Gmail label to mark as synced
        if (gmailLabelId) {
          processingLog.push(`Attempting to apply label ${gmailLabelId} to message ${attachment.messageId}`)
          try {
            const gmail = await getGmailClient(providerToken)
            await applyLabelToMessage(gmail, attachment.messageId, gmailLabelId)
            processingLog.push(`✓ Gmail label applied to email`)
            console.log(`[LABEL] Successfully applied label ${gmailLabelId} to message ${attachment.messageId}`)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            processingLog.push(`⚠ Failed to apply Gmail label: ${errorMsg}`)
            console.error(`[LABEL] Failed to apply label to message ${attachment.messageId}:`, error)
            // Don't fail the sync if labeling fails
          }
        } else {
          processingLog.push(`⚠ No Gmail label ID available, skipping labeling`)
        }

        // Step 9: Archive email if enabled
        if (settings.archive_synced_emails) {
          processingLog.push(`Attempting to archive message ${attachment.messageId}`)
          try {
            const gmail = await getGmailClient(providerToken)
            await archiveMessage(gmail, attachment.messageId)
            processingLog.push(`✓ Email archived (removed from inbox)`)
            console.log(`[ARCHIVE] Successfully archived message ${attachment.messageId}`)
          } catch (error) {
            const errorMsg = error instanceof Error ? error.message : 'Unknown error'
            processingLog.push(`⚠ Failed to archive email: ${errorMsg}`)
            console.error(`[ARCHIVE] Failed to archive message ${attachment.messageId}:`, error)
            // Don't fail the sync if archiving fails
          }
        }

      } catch (error) {
        processingLog.push(`✗ FAILED - ${error instanceof Error ? error.message : String(error)}`)
      }
    }

    // --- INBOX FOLDER SYNC ---
    if (settings.inbox_folder_enabled && settings.inbox_folder_id) {
      processingLog.push(`\n=== STARTING INBOX FOLDER SYNC ===`)
      processingLog.push(`Scanning folder: ${settings.inbox_folder_name || settings.inbox_folder_id}`)

      try {
        const lastSyncDate = settings.last_inbox_sync_at ? new Date(settings.last_inbox_sync_at) : undefined
        if (lastSyncDate) {
          processingLog.push(`Looking for files modified after: ${lastSyncDate.toLocaleString()}`)
        }

        const { documents: inboxDocs, debug: inboxDebug } = await scanInboxFolder(
          providerToken,
          settings.inbox_folder_id,
          lastSyncDate
        )

        processingLog.push(`Found ${inboxDocs.length} new files in inbox folder`)

        let inboxDocsProcessed = 0

        if (inboxDocs.length > 0) {
          // Get Drive client for file operations
          const drive = await getDriveClient(providerToken)

          // Find or create Pending Approval folder (reusing logic from Gmail sync would be better, but doing it inline for now)
          // We already have pendingFolderId from Gmail sync if it ran, but we can't guarantee it ran successfully or found pending folder
          // So let's ensure we have the pending folder again

          // Helper to get pending folder ID
          const getPendingFolderId = async () => {
            const foldersResponse = await drive.files.list({
              q: `name='Pending Approval' and '${settings.drive_folder_id}' in parents and trashed=false`,
              fields: 'files(id, name)',
            })

            if (foldersResponse.data.files?.[0]?.id) {
              return foldersResponse.data.files[0].id
            }

            // Create if not exists
            const folderResponse = await drive.files.create({
              requestBody: {
                name: 'Pending Approval',
                mimeType: 'application/vnd.google-apps.folder',
                parents: [settings.drive_folder_id!],
              },
              fields: 'id',
            })
            return folderResponse.data.id!
          }

          const pendingFolderId = await getPendingFolderId()

          // Process inbox documents
          for (let i = 0; i < inboxDocs.length; i++) {
            const doc = inboxDocs[i]
            processingLog.push(`\n--- Processing inbox file ${i + 1}/${inboxDocs.length} ---`)
            processingLog.push(`Filename: ${doc.filename}`)

            try {
              // Check duplicates
              const { data: existingDoc } = await supabase
                .from('documents')
                .select('id, filename')
                .eq('user_id', user.id)
                .eq('file_hash', doc.fileHash)
                .single()

              if (existingDoc) {
                processingLog.push(`⊘ DUPLICATE - File already exists: ${existingDoc.filename}`)
                duplicatesSkipped++
                continue
              }

              // Copy file to Pending Approval
              processingLog.push(`Copying to Pending Approval folder...`)
              const copiedFile = await drive.files.copy({
                fileId: doc.driveFileId,
                requestBody: {
                  name: doc.filename,
                  parents: [pendingFolderId]
                },
                fields: 'id, webViewLink'
              })

              const driveFileId = copiedFile.data.id!
              processingLog.push(`Copied file created: ${driveFileId}`)

              // Process with webhook
              let webhookData = null
              let webhookError = null
              let classification: 'invoice' | 'credit_note' | 'unclassified' = 'unclassified'

              if (settings.webhook_url && settings.webhook_url.trim()) {
                processingLog.push(`Sending to webhook...`)
                try {
                  const response = await sendPdfToWebhook(
                    doc.data,
                    doc.filename,
                    settings.webhook_url
                  )
                  webhookData = response

                  if (response.document_type === 'supplier_invoice') {
                    classification = 'invoice'
                  } else if (response.document_type === 'credit_note') {
                    classification = 'credit_note'
                  } else {
                    processingLog.push(`⊘ SKIPPED - Document type "${response.document_type}" is not an invoice or credit note`)
                    // Note: We might want to delete the copied file if skipped, but for safety lets keep it or just don't insert to DB
                    // Deleting copy:
                    await drive.files.delete({ fileId: driveFileId })
                    continue
                  }

                  processingLog.push(`Webhook processed: ${response.document_type}`)
                } catch (error) {
                  webhookError = error instanceof Error ? error.message : 'Unknown webhook error'
                  processingLog.push(`⚠ Webhook failed: ${webhookError}`)
                  // Clean up copy
                  await drive.files.delete({ fileId: driveFileId })
                  continue
                }
              } else {
                processingLog.push(`No webhook URL, skipping`)
                // Clean up copy
                await drive.files.delete({ fileId: driveFileId })
                continue
              }

              // Save to database
              const { error: insertError } = await supabase.from('documents').insert({
                user_id: user.id,
                gmail_account_id: gmailAccount.id, // Using same account as it's the provider
                email_message_id: `drive_inbox_${doc.driveFileId}`, // unique fake ID
                file_hash: doc.fileHash,
                subject: `File from Inbox: ${doc.filename}`,
                sender: 'Drive Upload',
                sender_domain: 'drive.google.com',
                received_date: doc.createdDate.toISOString(),
                filename: doc.filename,
                original_classification: classification,
                final_classification: classification,
                confidence_score: webhookData ? 1.0 : 0.5,
                status: 'pending',
                drive_file_id: driveFileId,
                drive_folder_path: 'Pending Approval',
                source: 'inbox_folder',
                inbox_file_id: doc.driveFileId,
                // Webhook data
                invoice_number: webhookData?.invoice_number || null,
                issue_date: webhookData?.issue_date || null,
                supplier_name: webhookData?.supplier_name || null,
                supplier_vat_number: webhookData?.supplier_vat_number || null,
                total_without_vat: webhookData?.total_without_vat ? parseFloat(webhookData.total_without_vat) : null,
                total_vat: webhookData?.total_vat ? parseFloat(webhookData.total_vat) : null,
                invoice_total: webhookData?.invoice_total ? parseFloat(webhookData.invoice_total) : null,
                currency: webhookData?.currency || null,
                numb_pages: webhookData?.numb_pages || null,
                document_type: webhookData?.document_type || null,
                webhook_processed_at: webhookData ? new Date().toISOString() : null,
                webhook_error: webhookError,
              })

              if (insertError) {
                processingLog.push(`DATABASE ERROR: ${insertError.message}`)
                throw new Error(insertError.message)
              }

              documentsFound++
              inboxDocsProcessed++
              processingLog.push(`✓ SUCCESS - Saved to database`)

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
