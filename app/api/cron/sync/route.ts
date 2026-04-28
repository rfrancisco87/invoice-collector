import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import {
  scanGmailForInvoices,
  calculateFileHash,
  getGmailClient,
  getOrCreateLabel,
  applyLabelToMessage,
  archiveMessage,
} from '@/lib/gmail'
import { sendPdfToWebhook } from '@/lib/webhook'
import { getDriveClient } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'
import { sendNewDocumentsEmail } from '@/lib/email'
import { scanInboxFolder } from '@/lib/drive-inbox'
import { Readable } from 'stream'

/**
 * Shared sync logic used by both GET (Vercel cron) and POST (manual trigger)
 */
async function runCronSync(startTime: number) {
  try {
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
    const { data: allSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('auto_sync_enabled', true)

    if (settingsError) {
      console.error('Failed to fetch user settings:', settingsError)
      return NextResponse.json(
        { error: 'Failed to fetch user settings', details: settingsError.message },
        { status: 500 }
      )
    }

    if (!allSettings || allSettings.length === 0) {
      return NextResponse.json({
        message: 'No users with auto-sync enabled',
        processed: 0,
        skipped: 0,
        duration_ms: Date.now() - startTime,
      })
    }

    // Filter users who are due for a sync based on their frequency
    const now = new Date()
    const usersToSync = allSettings.filter((settings) => {
      if (!settings.last_auto_sync_at) {
        // Never synced before, sync now
        return true
      }

      const lastSync = new Date(settings.last_auto_sync_at)
      const minutesSinceLastSync = (now.getTime() - lastSync.getTime()) / (1000 * 60)
      // Derive frequency from subscription_tier (source of truth), fall back to sync_frequency_minutes
      const syncFrequency = settings.subscription_tier === 'paid'
        ? 15
        : (settings.sync_frequency_minutes || 720)

      return minutesSinceLastSync >= syncFrequency
    })

    if (usersToSync.length === 0) {
      return NextResponse.json({
        message: 'No users due for sync',
        total_users: allSettings.length,
        processed: 0,
        skipped: allSettings.length,
        duration_ms: Date.now() - startTime,
      })
    }

    const results = []
    let totalDocumentsFound = 0
    let totalDuplicatesSkipped = 0

    // Process each user who is due for sync
    for (const userSettings of usersToSync) {
      const userStartTime = Date.now()

      try {
        // Get Gmail account for this user
        const { data: gmailAccount, error: gmailError } = await supabase
          .from('gmail_accounts')
          .select('*')
          .eq('user_id', userSettings.user_id)
          .single()

        if (gmailError || !gmailAccount) {
          results.push({
            userId: userSettings.user_id,
            error: 'No Gmail account found',
            duration_ms: Date.now() - userStartTime,
          })
          continue
        }

        // Get valid access token (refresh if needed)
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

        // Create sync job record
        const { data: syncJob } = await supabase
          .from('sync_jobs')
          .insert({
            user_id: userSettings.user_id,
            gmail_account_id: gmailAccount.id,
            status: 'running',
            sync_from_date: new Date(
              Date.now() - userSettings.sync_days_back * 24 * 60 * 60 * 1000
            ).toISOString(),
            sync_to_date: new Date().toISOString(),
          })
          .select()
          .single()

        if (!syncJob) {
          results.push({
            userId: userSettings.user_id,
            error: 'Failed to create sync job',
            duration_ms: Date.now() - userStartTime,
          })
          continue
        }

        // Get or create Gmail label if configured
        let gmailLabelId: string | null = null
        if (userSettings.gmail_sync_label && userSettings.gmail_sync_label.trim()) {
          try {
            const gmail = await getGmailClient(tokenResult.accessToken)
            gmailLabelId = await getOrCreateLabel(gmail, userSettings.gmail_sync_label)
          } catch (error) {
            console.error(`Failed to get/create Gmail label for user ${userSettings.user_id}:`, error)
          }
        }

        // Scan Gmail for invoices
        const { attachments } = await scanGmailForInvoices(
          tokenResult.accessToken,
          userSettings.sync_days_back
        )

        let documentsFound = 0
        let duplicatesSkipped = 0
        const newDocuments = []

        // Process each attachment
        for (const attachment of attachments) {
          try {
            const fileHash = calculateFileHash(attachment.data)

            // Check for duplicates
            const { data: existingDoc } = await supabase
              .from('documents')
              .select('id')
              .eq('user_id', userSettings.user_id)
              .eq('file_hash', fileHash)
              .single()

            if (existingDoc) {
              duplicatesSkipped++
              continue
            }

            // Upload to Google Drive
            const drive = await getDriveClient(tokenResult.accessToken)

            // Find or create Pending Approval folder
            const foldersResponse = await drive.files.list({
              q: `name='Pending Approval' and '${userSettings.drive_folder_id}' in parents and trashed=false`,
              fields: 'files(id, name)',
            })

            let pendingFolderId = foldersResponse.data.files?.[0]?.id

            if (!pendingFolderId) {
              const folderResponse = await drive.files.create({
                requestBody: {
                  name: 'Pending Approval',
                  mimeType: 'application/vnd.google-apps.folder',
                  parents: [userSettings.drive_folder_id],
                },
                fields: 'id',
              })
              pendingFolderId = folderResponse.data.id!
            }

            // Upload file to Drive
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

            // Process with webhook if configured
            let webhookData = null
            let webhookError = null
            let classification: 'invoice' | 'credit_note' | 'unclassified' = 'unclassified'

            const effectiveWebhookUrl = userSettings.webhook_url?.trim() || process.env.WEBHOOK_URL?.trim()

            if (effectiveWebhookUrl) {
              try {
                const response = await sendPdfToWebhook(
                  attachment.data,
                  attachment.filename,
                  effectiveWebhookUrl
                )
                webhookData = response

                // Map webhook document_type to classification
                if (response.document_type === 'supplier_invoice') {
                  classification = 'invoice'
                } else if (response.document_type === 'credit_note') {
                  classification = 'credit_note'
                } else {
                  // Skip documents that are not invoices or credit notes (e.g., bank statements)
                  console.log(`[Cron Sync] Skipping document type "${response.document_type}" - not an invoice or credit note`)
                  if (fileResponse.data.id) {
                    await drive.files.delete({ fileId: fileResponse.data.id })
                  }
                  continue
                }
              } catch (error) {
                webhookError = error instanceof Error ? error.message : 'Unknown webhook error'
              }
            }

            // Skip if no webhook configured and can't classify (optional: you might want to save these)
            // For now, only save if we have a valid classification from webhook
            if (!webhookData && effectiveWebhookUrl) {
              // Webhook was configured but failed - skip this document
              console.log(`[Cron Sync] Skipping document - webhook failed and cannot classify`)
              if (fileResponse.data.id) {
                await drive.files.delete({ fileId: fileResponse.data.id })
              }
              continue
            }

            // Save document to database
            const { data: newDoc, error: insertError } = await supabase
              .from('documents')
              .insert({
                user_id: userSettings.user_id,
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
                total_without_vat: webhookData?.total_without_vat
                  ? parseFloat(webhookData.total_without_vat)
                  : null,
                total_vat: webhookData?.total_vat ? parseFloat(webhookData.total_vat) : null,
                invoice_total: webhookData?.invoice_total
                  ? parseFloat(webhookData.invoice_total)
                  : null,
                currency: webhookData?.currency || null,
                numb_pages: webhookData?.numb_pages || null,
                document_type: webhookData?.document_type || null,
                webhook_processed_at: webhookData ? new Date().toISOString() : null,
                webhook_error: webhookError,
              })
              .select()
              .single()

            if (!insertError && newDoc) {
              documentsFound++
              newDocuments.push(newDoc)

              // Apply Gmail label
              if (gmailLabelId) {
                try {
                  const gmail = await getGmailClient(tokenResult.accessToken)
                  await applyLabelToMessage(gmail, attachment.messageId, gmailLabelId)
                } catch (error) {
                  console.error(`Failed to apply label to message ${attachment.messageId}:`, error)
                }
              }

              // Archive email if enabled
              if (userSettings.archive_synced_emails) {
                try {
                  const gmail = await getGmailClient(tokenResult.accessToken)
                  await archiveMessage(gmail, attachment.messageId)
                } catch (error) {
                  console.error(`Failed to archive message ${attachment.messageId}:`, error)
                }
              }
            }
          } catch (error) {
            console.error(`Error processing attachment for user ${userSettings.user_id}:`, error)
            continue
          }
        }

        // --- INBOX FOLDER SYNC (before sync job update so counts are accurate) ---
        if (userSettings.inbox_folder_enabled && userSettings.inbox_folder_id) {
          try {
            const lastSyncDate = userSettings.last_inbox_sync_at ? new Date(userSettings.last_inbox_sync_at) : undefined

            const { documents: inboxDocs } = await scanInboxFolder(
              tokenResult.accessToken,
              userSettings.inbox_folder_id,
              lastSyncDate
            )

            let inboxDocsProcessed = 0

            if (inboxDocs.length > 0) {
              const drive = await getDriveClient(tokenResult.accessToken)

              const getPendingFolderId = async () => {
                const foldersResponse = await drive.files.list({
                  q: `name='Pending Approval' and '${userSettings.drive_folder_id}' in parents and trashed=false`,
                  fields: 'files(id, name)',
                })
                if (foldersResponse.data.files?.[0]?.id) return foldersResponse.data.files[0].id

                const folderResponse = await drive.files.create({
                  requestBody: {
                    name: 'Pending Approval',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [userSettings.drive_folder_id!],
                  },
                  fields: 'id',
                })
                return folderResponse.data.id!
              }

              const pendingFolderId = await getPendingFolderId()

              for (const doc of inboxDocs) {
                try {
                  // Check duplicates
                  const { data: existingDoc } = await supabase
                    .from('documents')
                    .select('id')
                    .eq('user_id', userSettings.user_id)
                    .eq('file_hash', doc.fileHash)
                    .single()

                  if (existingDoc) {
                    duplicatesSkipped++
                    // Clean up duplicate from inbox
                    try {
                      await drive.files.delete({ fileId: doc.driveFileId })
                    } catch { /* ignore cleanup errors */ }
                    continue
                  }

                  // Copy to Pending Approval
                  const copiedFile = await drive.files.copy({
                    fileId: doc.driveFileId,
                    requestBody: { name: doc.filename, parents: [pendingFolderId] },
                    fields: 'id',
                  })
                  const driveFileId = copiedFile.data.id!

                  // Webhook & Classification
                  let webhookData = null
                  let webhookError = null
                  let classification: 'invoice' | 'credit_note' | 'unclassified' = 'unclassified'

                  const effectiveWebhookUrl = userSettings.webhook_url?.trim() || process.env.WEBHOOK_URL?.trim()

                  if (effectiveWebhookUrl) {
                    try {
                      const response = await sendPdfToWebhook(
                        doc.data,
                        doc.filename,
                        effectiveWebhookUrl
                      )
                      webhookData = response

                      if (response.document_type === 'supplier_invoice') {
                        classification = 'invoice'
                      } else if (response.document_type === 'credit_note') {
                        classification = 'credit_note'
                      } else {
                        await drive.files.delete({ fileId: driveFileId })
                        continue
                      }
                    } catch (error) {
                      webhookError = error instanceof Error ? error.message : 'Unknown webhook error'
                      await drive.files.delete({ fileId: driveFileId })
                      continue
                    }
                  } else {
                    await drive.files.delete({ fileId: driveFileId })
                    continue
                  }

                  // Save to DB
                  const { data: newDoc, error: insertError } = await supabase.from('documents').insert({
                    user_id: userSettings.user_id,
                    gmail_account_id: gmailAccount.id,
                    email_message_id: `drive_inbox_${doc.driveFileId}`,
                    file_hash: doc.fileHash,
                    subject: `File from Inbox: ${doc.filename}`,
                    sender: 'Inbox folder',
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
                  }).select().single()

                  if (!insertError && newDoc) {
                    documentsFound++
                    inboxDocsProcessed++
                    newDocuments.push(newDoc)

                    // Clean up original file from inbox (move behaviour)
                    try {
                      await drive.files.delete({ fileId: doc.driveFileId })
                    } catch { /* ignore cleanup errors */ }
                  }

                } catch (err) {
                  console.error(`Error processing inbox file for user ${userSettings.user_id}:`, err)
                }
              }

              if (inboxDocsProcessed > 0) {
                await supabase
                  .from('user_settings')
                  .update({ last_inbox_sync_at: new Date().toISOString() })
                  .eq('user_id', userSettings.user_id)
              }
            }
          } catch (inboxErr) {
            console.error(`Inbox sync failed for user ${userSettings.user_id}:`, inboxErr)
          }
        }

        // Update sync job status (now includes both Gmail and inbox folder counts)
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

        // Update last auto sync time
        await supabase
          .from('user_settings')
          .update({
            last_auto_sync_at: new Date().toISOString(),
          })
          .eq('user_id', userSettings.user_id)

        // Send email notification if enabled and new documents found
        if (userSettings.email_notifications_enabled && newDocuments.length > 0) {
          try {
            const { data: userData } = await supabase.auth.admin.getUserById(userSettings.user_id)

            if (userData?.user?.email) {
              await sendNewDocumentsEmail(
                userSettings.notification_email || userData.user.email,
                newDocuments,
                userSettings.drive_folder_id
              )
            }
          } catch (error) {
            console.error(`Failed to send notification email for user ${userSettings.user_id}:`, error)
          }
        }

        totalDocumentsFound += documentsFound
        totalDuplicatesSkipped += duplicatesSkipped

        results.push({
          userId: userSettings.user_id,
          tier: userSettings.subscription_tier || 'free',
          documentsFound,
          duplicatesSkipped,
          emailSent: userSettings.email_notifications_enabled && newDocuments.length > 0,
          duration_ms: Date.now() - userStartTime,
        })
      } catch (error) {
        console.error(`Error syncing user ${userSettings.user_id}:`, error)
        results.push({
          userId: userSettings.user_id,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - userStartTime,
        })
      }
    }

    return NextResponse.json({
      success: true,
      total_users: allSettings.length,
      processed: usersToSync.length,
      skipped: allSettings.length - usersToSync.length,
      total_documents_found: totalDocumentsFound,
      total_duplicates_skipped: totalDuplicatesSkipped,
      duration_ms: Date.now() - startTime,
      results,
    })
  } catch (error) {
    console.error('Cron sync failed:', error)
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

/**
 * Validate cron secret using constant-time comparison to prevent timing attacks
 */
function validateCronSecret(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET

  // Reject if CRON_SECRET is not configured or empty
  if (!cronSecret || cronSecret.trim() === '') {
    console.error('CRON_SECRET is not configured')
    return false
  }

  // Reject if no auth header provided
  if (!authHeader) {
    return false
  }

  // Extract token from "Bearer <token>" format
  const expectedHeader = `Bearer ${cronSecret}`

  // Use constant-time comparison to prevent timing attacks
  // Ensure both strings are same length for timingSafeEqual
  if (authHeader.length !== expectedHeader.length) {
    return false
  }

  try {
    return timingSafeEqual(
      Buffer.from(authHeader, 'utf8'),
      Buffer.from(expectedHeader, 'utf8')
    )
  } catch {
    return false
  }
}

/**
 * GET endpoint - Called by Vercel Cron
 * Vercel cron jobs send GET requests, so this is the main entry point for automated syncs.
 */
export async function GET(request: Request) {
  const startTime = Date.now()

  try {
    // Verify cron secret with secure comparison
    const authHeader = request.headers.get('authorization')
    if (!validateCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Run the sync logic
    return await runCronSync(startTime)
  } catch (error) {
    console.error('Cron sync (GET) failed:', error)
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

/**
 * POST endpoint - For manual triggers or external cron services
 * Can be used for testing or by services that prefer POST requests.
 */
export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    // Verify cron secret with secure comparison
    const authHeader = request.headers.get('authorization')
    if (!validateCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Run the sync logic
    return await runCronSync(startTime)
  } catch (error) {
    console.error('Cron sync (POST) failed:', error)
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
