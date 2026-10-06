/**
 * Shared per-user sync pipeline.
 *
 * Both entry points — the manual sync (/api/sync) and the automated cron sweep
 * (/api/cron/sync) — run exactly this. Previously the cron route reimplemented
 * hash / upload / classify / insert inline instead of calling ingestDocument,
 * which meant the two paths drifted: the cron copy silently skipped the
 * auto-reject rules entirely, and any change to classification had to be
 * written twice or it only took effect on manual syncs.
 *
 * The routes keep their own sync_jobs bookkeeping and response shapes; only the
 * document work lives here.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import {
    scanGmailForInvoices,
    getGmailClient,
    getOrCreateLabel,
    applyLabelToMessage,
    archiveMessage,
    type EmailAttachment,
} from '@/lib/gmail'
import { getDriveClient } from '@/lib/google-drive'
import { scanInboxFolder, trashInboxFile } from '@/lib/drive-inbox'
import { ingestDocument } from '@/lib/ingestion'
import { resolveSiblingsForMessage } from '@/lib/classifier/resolve-siblings'
import type { PairPreference } from '@/lib/classifier/pairing'

export interface SyncedDocumentSummary {
    id: string
    filename: string
    sender: string
    subject: string
    received_date: string
    final_classification: string
    confidence_score: number
}

export interface SyncRunnerContext {
    /** Service-role client. All queries here are explicitly scoped to user.id. */
    supabase: SupabaseClient<any, any, any>
    user: { id: string; email?: string | null }
    settings: any
    gmailAccount: any
    providerToken: string
}

export interface SyncRunnerResult {
    emailsScanned: number
    documentsFound: number
    duplicatesSkipped: number
    newDocuments: SyncedDocumentSummary[]
    log: string[]
    /** Gmail scan diagnostics, surfaced by the manual sync response. Null if the scan failed. */
    gmailDebug: Awaited<ReturnType<typeof scanGmailForInvoices>>['debug'] | null
}

/**
 * Group attachments by the email they arrived in.
 *
 * Senders like Stripe attach an invoice and a receipt to the same message.
 * Ingesting them as unrelated files loses the fact that they describe one
 * transaction, so the pipeline processes a message's attachments together and
 * keeps them adjacent in the result.
 */
export function groupAttachmentsByMessage(
    attachments: EmailAttachment[],
): EmailAttachment[][] {
    const groups = new Map<string, EmailAttachment[]>()

    for (const attachment of attachments) {
        const existing = groups.get(attachment.messageId)
        if (existing) {
            existing.push(attachment)
        } else {
            groups.set(attachment.messageId, [attachment])
        }
    }

    return Array.from(groups.values())
}

/**
 * Run a full sync for one user: Gmail attachments, then the Drive inbox folder.
 *
 * Never throws for a single bad document — per-item failures are recorded in
 * the log and the sweep continues, so one malformed PDF cannot abort a user's
 * whole sync (or, in the cron path, everyone else's).
 */
export async function runUserSync(ctx: SyncRunnerContext): Promise<SyncRunnerResult> {
    const { supabase, user, settings, gmailAccount, providerToken } = ctx

    const log: string[] = []
    const newDocuments: SyncedDocumentSummary[] = []
    let emailsScanned = 0
    let documentsFound = 0
    let duplicatesSkipped = 0
    let gmailDebug: SyncRunnerResult['gmailDebug'] = null

    const recordNewDocument = async (documentId: string) => {
        const { data } = await supabase
            .from('documents')
            .select('id, filename, sender, subject, received_date, final_classification, confidence_score')
            .eq('id', documentId)
            .eq('user_id', user.id)
            .single()

        if (data) {
            newDocuments.push({
                ...(data as any),
                confidence_score: (data as any).confidence_score ?? 0,
            })
        }
    }

    // --- GMAIL SYNC ---

    // Resolve the sync label once. A failure here is not fatal: labelling is
    // bookkeeping, and losing it must not cost the user their documents.
    let gmailLabelId: string | null = null
    if (settings.gmail_sync_label && settings.gmail_sync_label.trim()) {
        try {
            const gmail = await getGmailClient(providerToken)
            gmailLabelId = await getOrCreateLabel(gmail, settings.gmail_sync_label)
            log.push(`Using Gmail label "${settings.gmail_sync_label}" (${gmailLabelId})`)
        } catch (error) {
            log.push(`⚠ Failed to get/create Gmail label: ${errorText(error)}`)
        }
    }

    try {
        const { attachments, debug } = await scanGmailForInvoices(
            providerToken,
            settings.sync_days_back,
        )

        gmailDebug = debug
        emailsScanned = attachments.length
        log.push(`=== GMAIL SYNC ===`)
        log.push(`Attachments to process: ${attachments.length}`)

        if (attachments.length === 0 && debug.pdfAttachmentsFound > 0) {
            log.push(
                `WARNING: no attachments to process despite PDF extraction reporting ${debug.pdfAttachmentsFound}`,
            )
        }

        const messages = groupAttachmentsByMessage(attachments)

        for (const message of messages) {
            // Label and archive act on the message, not the attachment, so they
            // run once per message after its files are ingested — the old code
            // repeated both calls for every attachment.
            let messageProducedDocument = false

            for (const attachment of message) {
                try {
                    const result = await ingestDocument(
                        { user, settings, gmailAccount, providerToken },
                        attachment.data,
                        attachment.filename,
                        {
                            emailMessageId: attachment.messageId,
                            subject: attachment.subject,
                            sender: attachment.sender,
                            senderDomain: attachment.senderDomain,
                            receivedDate: attachment.receivedDate,
                            source: 'gmail',
                        },
                    )

                    if (result.log) log.push(...result.log)

                    if (result.success) {
                        if (result.action === 'processed') {
                            documentsFound++
                            messageProducedDocument = true
                            if (result.documentId) await recordNewDocument(result.documentId)
                        } else if (result.action === 'duplicate_skipped') {
                            duplicatesSkipped++
                        } else if (result.action === 'auto_rejected') {
                            messageProducedDocument = true
                        }
                    }
                } catch (error) {
                    log.push(`✗ FAILED ${attachment.filename} - ${errorText(error)}`)
                }
            }

            if (!messageProducedDocument) continue

            const messageId = message[0].messageId

            // Pairing is a question about the whole message, so it runs once the
            // message's attachments are all ingested. Only multi-attachment
            // emails can produce a pair, so this is a cheap no-op for the
            // overwhelming majority.
            if (message.length > 1) {
                try {
                    const pairResult = await resolveSiblingsForMessage({
                        supabase,
                        userId: user.id,
                        emailMessageId: messageId,
                        preference: (settings.duplicate_pair_default ?? 'invoice') as PairPreference,
                        providerToken,
                    })
                    log.push(...pairResult.log)
                } catch (error) {
                    log.push(`⚠ Pair detection failed for ${messageId}: ${errorText(error)}`)
                }
            }

            if (gmailLabelId) {
                try {
                    const gmail = await getGmailClient(providerToken)
                    await applyLabelToMessage(gmail, messageId, gmailLabelId)
                } catch (error) {
                    log.push(`⚠ Failed to apply Gmail label to ${messageId}: ${errorText(error)}`)
                }
            }

            if (settings.archive_synced_emails) {
                try {
                    const gmail = await getGmailClient(providerToken)
                    await archiveMessage(gmail, messageId)
                } catch (error) {
                    log.push(`⚠ Failed to archive ${messageId}: ${errorText(error)}`)
                }
            }
        }
    } catch (error) {
        // A Gmail-wide failure (revoked scope, API outage) should not prevent the
        // inbox-folder pass below from running.
        log.push(`ERROR in Gmail sync: ${errorText(error)}`)
    }

    // --- DRIVE INBOX FOLDER SYNC ---

    if (settings.inbox_folder_enabled && settings.inbox_folder_id) {
        log.push(`\n=== INBOX FOLDER SYNC ===`)

        try {
            const lastSyncDate = settings.last_inbox_sync_at
                ? new Date(settings.last_inbox_sync_at)
                : undefined

            const { documents: inboxDocs, debug: inboxDebug } = await scanInboxFolder(
                providerToken,
                settings.inbox_folder_id,
                lastSyncDate,
            )

            log.push(`Found ${inboxDebug.filesFound} file(s), ${inboxDocs.length} to process`)

            let inboxDocsProcessed = 0

            if (inboxDocs.length > 0) {
                const drive = await getDriveClient(providerToken)

                for (const doc of inboxDocs) {
                    try {
                        const result = await ingestDocument(
                            { user, settings, gmailAccount, providerToken },
                            doc.data,
                            doc.filename,
                            {
                                emailMessageId: `drive_inbox_${doc.driveFileId}`,
                                subject: `File from Inbox: ${doc.filename}`,
                                sender: 'Inbox folder',
                                senderDomain: 'drive.google.com',
                                receivedDate: doc.createdDate,
                                source: 'inbox_folder',
                                inboxFileId: doc.driveFileId,
                            },
                        )

                        if (result.log) log.push(...result.log)

                        if (!result.success) continue

                        if (result.action === 'processed') {
                            documentsFound++
                            inboxDocsProcessed++
                            if (result.documentId) await recordNewDocument(result.documentId)
                        } else if (result.action === 'duplicate_skipped') {
                            duplicatesSkipped++
                        } else {
                            // auto_rejected already removed the inbox original.
                            continue
                        }

                        // Inbox behaves as a move, not a copy: the original is
                        // removed once the file is safely ingested or recognised
                        // as a duplicate.
                        try {
                            await trashInboxFile(drive, doc.driveFileId)
                        } catch (error) {
                            log.push(`⚠ Failed to remove ${doc.filename} from Inbox: ${errorText(error)}`)
                        }
                    } catch (error) {
                        log.push(`✗ FAILED inbox file ${doc.filename} - ${errorText(error)}`)
                    }
                }

                if (inboxDocsProcessed > 0) {
                    await supabase
                        .from('user_settings')
                        .update({ last_inbox_sync_at: new Date().toISOString() })
                        .eq('user_id', user.id)
                }
            }
        } catch (error) {
            log.push(`ERROR in inbox sync: ${errorText(error)}`)
        }
    }

    return { emailsScanned, documentsFound, duplicatesSkipped, newDocuments, log, gmailDebug }
}

function errorText(error: unknown): string {
    return error instanceof Error ? error.message : String(error)
}
