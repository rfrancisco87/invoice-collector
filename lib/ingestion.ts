import { createClient } from '@/lib/supabase/server'
import { calculateFileHash } from '@/lib/gmail'
import { getDriveClient } from '@/lib/google-drive'
import { applyConfidenceGate, classifyDocument, runPrefilter } from '@/lib/classifier'
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

        // 2a. Deterministic pre-filter (Layer A)
        //
        // Runs before the Drive upload and before the classifier, on metadata
        // alone. Bank statements, contracts, boarding passes and payslips are
        // discarded here so they cost no Drive quota, no webhook call, and — once
        // BYO keys land — no tokens. It is deliberately conservative: anything
        // ambiguous passes through, because losing a real invoice is far worse
        // than making the user reject one extra document.
        const prefilter = runPrefilter(
            {
                filename,
                subject: metadata.subject,
                sender: metadata.sender,
                senderDomain: metadata.senderDomain,
            },
            settings,
        )

        if (prefilter?.verdict === 'skip') {
            log.push(`⊘ PRE-FILTER SKIP - ${prefilter.reason}`)

            // Clean up the inbox original, matching auto-reject behaviour: the
            // file was never uploaded to Pending, so only the source remains.
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

            return { success: true, action: 'skipped_type', details: prefilter.reason, log }
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

        // 4. Classification (Layer B) + confidence gate (Layer C)
        //
        // Per-user backend only. There used to be a process.env.WEBHOOK_URL
        // fallback here, which meant any user without their own endpoint was
        // silently routed through the app owner's n8n instance — their quota,
        // their bill, their logs.
        log.push(`Classifying...`)
        const classifyResult = await classifyDocument(
            {
                fileData,
                filename,
                subject: metadata.subject,
                sender: metadata.sender,
                senderDomain: metadata.senderDomain,
            },
            settings,
        )

        const gate = applyConfidenceGate(classifyResult, settings)
        const classification = classifyResult.classification
        const webhookData = classifyResult.fields
        const webhookError = classifyResult.error ?? null

        log.push(`Classification: ${classification} (${classifyResult.confidence.toFixed(2)}) — ${classifyResult.reason}`)

        // A confidently-identified non-invoice is discarded, as before. The
        // difference is that "confidently" now means something: a low-confidence
        // or failed classification falls through and is kept as pending +
        // needs_review, instead of being deleted on the strength of a guess.
        // That deletion path is how real invoices were disappearing.
        if (classifyResult.variant === 'other' && !gate.needsReview) {
            log.push(`⊘ SKIPPED - ${classifyResult.reason}`)
            await drive.files.delete({ fileId: driveFileId })
            return { success: true, action: 'skipped_type', details: classifyResult.reason, log }
        }

        if (gate.needsReview) {
            log.push(`⚑ NEEDS REVIEW - ${gate.reason}`)
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
            confidence_score: classifyResult.confidence,
            // Kept alongside final_classification, which collapses receipts into
            // 'unclassified' and so cannot support invoice/receipt pairing.
            variant: classifyResult.variant,
            classification_source: classifyResult.source,
            classification_reason: gate.reason,
            needs_review: gate.needsReview,
            prefilter_matched: prefilter?.matched ?? null,
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
