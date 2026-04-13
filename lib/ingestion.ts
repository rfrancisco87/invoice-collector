import { createClient } from '@/lib/supabase/server'
import { calculateFileHash } from '@/lib/gmail'
import { getDriveClient } from '@/lib/google-drive'
import { sendPdfToWebhook } from '@/lib/webhook'
import { checkAutoDecision } from '@/lib/auto-decision'
import { Readable } from 'stream'

export interface IngestionResult {
    success: boolean
    documentId?: string
    action: 'processed' | 'auto_rejected' | 'duplicate_skipped' | 'duplicate_cleaned' | 'error' | 'skipped_type'
    details?: string
    log?: string[]
}

export interface IngestionContext {
    user: any
    settings: any
    gmailAccount?: any // Optional now
    providerToken: string
}

export async function ingestDocument(
    ctx: IngestionContext,
    fileData: Buffer,
    filename: string,
    metadata: {
        emailMessageId: string
        subject: string
        sender: string
        senderDomain: string
        receivedDate: Date
        source: 'gmail' | 'inbox_folder' | 'forwarding' | 'upload'
        inboxFileId?: string // If from drive inbox
    }
): Promise<IngestionResult> {
    const { user, settings, gmailAccount, providerToken } = ctx
    const log: string[] = []

    try {
        log.push(`Ingesting file: ${filename} from ${metadata.source}`)

        // 1. Calculate Hash
        const fileHash = calculateFileHash(fileData)
        log.push(`Hash: ${fileHash.substring(0, 16)}...`)

        // 2. Check Duplicates (by user + hash + messageId if needed, but hash is usually enough for exact dupes)
        // Note: The new constraint is (user_id, email_message_id, file_hash).

        const supabase = await createClient()

        const { data: existingDoc } = await supabase
            .from('documents')
            .select('id, filename')
            .eq('user_id', user.id)
            .eq('file_hash', fileHash)
            .single()

        if (existingDoc) {
            log.push(`⊘ DUPLICATE - File already exists: ${existingDoc.filename}`)
            return { success: true, action: 'duplicate_skipped', log }
        }

        // 2b. Auto-decision (learning from prior feedback)
        //
        // We check BEFORE uploading to Drive / calling the webhook so that
        // blocked senders and known-rejected files don't waste those quotas.
        // Only the 'reject' branch is acted on here — auto-approve requires
        // the webhook extraction data and the approved-folder flow, which is
        // deferred to a follow-up (the setting flag exists, the action does not).
        const autoDecision = await checkAutoDecision(supabase, {
            userId: user.id,
            fileHash,
            senderDomain: metadata.senderDomain,
            settings: {
                auto_reject_enabled: settings.auto_reject_enabled,
                auto_approve_enabled: settings.auto_approve_enabled,
            },
        })

        if (autoDecision?.action === 'reject') {
            log.push(`🤖 AUTO-REJECT - ${autoDecision.description}`)

            const autoRejectPayload: any = {
                user_id: user.id,
                email_message_id: metadata.emailMessageId,
                file_hash: fileHash,
                subject: metadata.subject,
                sender: metadata.sender,
                sender_domain: metadata.senderDomain,
                received_date: metadata.receivedDate.toISOString(),
                filename,
                // We never ran the classifier — leave it unclassified. The
                // extracted fields stay null. If the user restores the doc,
                // they can re-run the webhook from the UI (webhook_error path).
                original_classification: 'unclassified',
                final_classification: 'unclassified',
                confidence_score: 0,
                status: 'rejected',
                rejected_at: new Date().toISOString(),
                auto_action_reason: autoDecision.reason,
                source: metadata.source,
                inbox_file_id: metadata.inboxFileId,
            }
            if (gmailAccount?.id) autoRejectPayload.gmail_account_id = gmailAccount.id

            const { data: doc, error: insertError } = await supabase
                .from('documents')
                .insert(autoRejectPayload)
                .select()
                .single()
            if (insertError) throw new Error(insertError.message)

            // Clean up the inbox-folder original if this doc came from there.
            // There is no Drive file in the pending folder to delete because we
            // skipped the upload entirely.
            if (metadata.source === 'inbox_folder' && metadata.inboxFileId) {
                try {
                    const drive = await getDriveClient(providerToken)
                    await drive.files.delete({ fileId: metadata.inboxFileId })
                } catch (err: any) {
                    const status = err?.code ?? err?.response?.status
                    if (status !== 404) {
                        log.push(`⚠ Inbox cleanup failed: ${err?.message || err}`)
                    }
                }
            }

            // @ts-ignore - Supabase row types infer as never across this project
            return { success: true, action: 'auto_rejected', documentId: doc.id, log }
        }

        // 3. Upload to Drive
        // Ensure Pending Folder Exists (reuse logic or assume passed? logic is in sync route)
        // We'll traverse drive to find it.
        const drive = await getDriveClient(providerToken)

        // Find/Create Pending Folder
        // Optimization: This could be passed in or cached, but looking it up is safer
        const foldersResponse = await drive.files.list({
            q: `name='Pending Approval' and '${settings.drive_folder_id}' in parents and trashed=false`,
            fields: 'files(id)',
        })

        let pendingFolderId = foldersResponse.data.files?.[0]?.id

        if (!pendingFolderId) {
            // logic to create it
            const folderResponse = await drive.files.create({
                requestBody: {
                    name: 'Pending Approval',
                    mimeType: 'application/vnd.google-apps.folder',
                    parents: [settings.drive_folder_id],
                },
                fields: 'id',
            })
            pendingFolderId = folderResponse.data.id!
            log.push(`Created Pending folder: ${pendingFolderId}`)
        }

        // Upload
        const stream = new Readable()
        stream.push(fileData)
        stream.push(null)

        const fileResponse = await drive.files.create({
            requestBody: {
                name: filename,
                parents: [pendingFolderId],
            },
            media: {
                mimeType: 'application/pdf', // Checking this assumed it's PDF
                body: stream,
            },
            fields: 'id, webViewLink',
        })

        if (!fileResponse.data.id) throw new Error('Drive upload failed')
        const driveFileId = fileResponse.data.id
        log.push(`Uploaded to Drive: ${driveFileId}`)

        // 4. Webhook Classification
        const effectiveWebhookUrl = settings.webhook_url?.trim() || process.env.WEBHOOK_URL?.trim()
        let webhookData = null
        let webhookError = null
        let classification: 'invoice' | 'credit_note' | 'unclassified' = 'unclassified'

        if (effectiveWebhookUrl) {
            try {
                log.push(`Sending to webhook...`)
                const response = await sendPdfToWebhook(fileData, filename, effectiveWebhookUrl)
                webhookData = response

                if (response.document_type === 'supplier_invoice') {
                    classification = 'invoice'
                } else if (response.document_type === 'credit_note') {
                    classification = 'credit_note'
                } else {
                    // Skip logic? user wants to skip.
                    // If we skip, we should delete the drive file?
                    log.push(`⊘ SKIPPED - Document type "${response.document_type}" is not an invoice`)
                    await drive.files.delete({ fileId: driveFileId })
                    return { success: true, action: 'skipped_type', log }
                }
            } catch (err) {
                webhookError = err instanceof Error ? err.message : 'Unknown webhook error'
                log.push(`⚠ Webhook failed: ${webhookError}`)
                // If webhook fails, we default to unclassified but KEEP the file?
                // Or skip? Usually keep as Pending.
            }
        }

        // 5. DB Insert
        // Prepare insert object handling optional fields
        const insertPayload: any = {
            user_id: user.id,
            email_message_id: metadata.emailMessageId,
            file_hash: fileHash,
            subject: metadata.subject,
            sender: metadata.sender,
            sender_domain: metadata.senderDomain,
            received_date: metadata.receivedDate.toISOString(),
            filename: filename,
            original_classification: classification,
            final_classification: classification,
            confidence_score: webhookData ? 1.0 : 0.5,
            status: 'pending',
            drive_file_id: driveFileId,
            drive_folder_path: 'Pending Approval',
            source: metadata.source,
            inbox_file_id: metadata.inboxFileId,
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
        }

        // Only add gmail_account_id if present
        if (gmailAccount?.id) {
            insertPayload.gmail_account_id = gmailAccount.id
        }

        const { data: doc, error: insertError } = await supabase.from('documents').insert(insertPayload).select().single()

        if (insertError) throw new Error(insertError.message)

        log.push(`✓ SUCCESS - Saved to database`)
        return { success: true, action: 'processed', documentId: doc.id, log }

    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        log.push(`✗ FAILED - ${msg}`)
        return { success: false, action: 'error', details: msg, log }
    }
}
