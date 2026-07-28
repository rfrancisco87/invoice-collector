/**
 * Apply pair detection to the documents of one email, after ingestion.
 *
 * This runs once per email rather than per attachment: pairing is inherently a
 * question about a set, and ingestDocument only ever sees one file. Both ingest
 * paths call it after finishing a message's attachments — the Gmail sweep in
 * lib/sync-runner.ts and the forwarding webhook in /api/inbound-email, which is
 * the route Stripe mail usually arrives through.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { getDriveClient } from '@/lib/google-drive'
import {
    detectPairs,
    resolvePair,
    type PairCandidate,
    type PairPreference,
} from '@/lib/classifier/pairing'

export interface ResolveSiblingsInput {
    supabase: SupabaseClient<any, any, any>
    userId: string
    emailMessageId: string
    /** user_settings.duplicate_pair_default */
    preference: PairPreference
    /** Needed to remove the discarded side's file from Pending Approval. */
    providerToken: string
}

export interface ResolveSiblingsResult {
    pairsFound: number
    discarded: number
    awaitingChoice: number
    log: string[]
}

/**
 * Detect and resolve invoice/receipt pairs within a single email.
 *
 * Only ever touches documents that are still pending and still unpaired, so
 * re-running is safe and never revisits something the user already decided.
 */
export async function resolveSiblingsForMessage(
    input: ResolveSiblingsInput,
): Promise<ResolveSiblingsResult> {
    const { supabase, userId, emailMessageId, preference, providerToken } = input
    const log: string[] = []

    const { data, error } = await supabase
        .from('documents')
        .select('id, filename, variant, invoice_total, supplier_name, issue_date, invoice_number, drive_file_id')
        .eq('user_id', userId)
        .eq('email_message_id', emailMessageId)
        .eq('status', 'pending')
        .eq('pair_state', 'unpaired')

    if (error) {
        log.push(`⚠ Pair detection failed to read documents: ${error.message}`)
        return { pairsFound: 0, discarded: 0, awaitingChoice: 0, log }
    }

    const rows = (data as any[]) ?? []

    // One attachment is the overwhelmingly common case — bail before doing
    // anything else.
    if (rows.length < 2) {
        return { pairsFound: 0, discarded: 0, awaitingChoice: 0, log }
    }

    const candidates: PairCandidate[] = rows.map((row) => ({
        id: row.id,
        filename: row.filename,
        variant: row.variant,
        invoice_total: row.invoice_total,
        supplier_name: row.supplier_name,
        issue_date: row.issue_date,
        invoice_number: row.invoice_number,
    }))

    const pairs = detectPairs(candidates)
    if (pairs.length === 0) {
        return { pairsFound: 0, discarded: 0, awaitingChoice: 0, log }
    }

    const driveFileIds = new Map<string, string | null>(
        rows.map((row) => [row.id, row.drive_file_id]),
    )

    let discarded = 0
    let awaitingChoice = 0

    for (const pair of pairs) {
        const resolution = resolvePair(pair, preference)

        log.push(
            `⇄ PAIR - ${pair.invoice.filename} + ${pair.receipt.filename} (${pair.reason})`,
        )

        // Link both sides regardless of the outcome, so the UI can render them
        // together and the user can see what was matched with what.
        await supabase
            .from('documents')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ paired_with_id: pair.receipt.id, pair_reason: pair.reason })
            .eq('id', pair.invoice.id)
            .eq('user_id', userId)

        await supabase
            .from('documents')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ paired_with_id: pair.invoice.id, pair_reason: pair.reason })
            .eq('id', pair.receipt.id)
            .eq('user_id', userId)

        if (resolution.awaitingChoice) {
            await supabase
                .from('documents')
                // @ts-ignore - Supabase row types infer as never across this project
                .update({ pair_state: 'awaiting_choice' })
                .in('id', [pair.invoice.id, pair.receipt.id])
                .eq('user_id', userId)

            awaitingChoice += 2
            log.push(`  → aguarda escolha do utilizador`)
            continue
        }

        if (resolution.keepIds.length > 0) {
            await supabase
                .from('documents')
                // @ts-ignore - Supabase row types infer as never across this project
                .update({ pair_state: 'kept' })
                .in('id', resolution.keepIds)
                .eq('user_id', userId)
        }

        for (const discardId of resolution.discardIds) {
            // Rejected rather than deleted: the row is the record of why the
            // document is not in the pending list, and the existing restore
            // flow can bring it back if the automatic choice was wrong.
            await supabase
                .from('documents')
                // @ts-ignore - Supabase row types infer as never across this project
                .update({
                    pair_state: 'discarded_duplicate',
                    status: 'rejected',
                    rejected_at: new Date().toISOString(),
                    auto_action_reason: 'sibling_not_selected',
                })
                .eq('id', discardId)
                .eq('user_id', userId)

            const driveFileId = driveFileIds.get(discardId)
            if (driveFileId) {
                try {
                    const drive = await getDriveClient(providerToken)
                    await drive.files.delete({ fileId: driveFileId })
                } catch (err: any) {
                    const status = err?.code ?? err?.response?.status
                    if (status !== 404) {
                        log.push(`  ⚠ Falha ao remover ficheiro do Drive: ${err?.message || err}`)
                    }
                }
            }

            discarded++
        }

        const keptLabel = preference === 'invoice' ? 'fatura' : preference === 'receipt' ? 'recibo' : 'ambos'
        log.push(`  → mantido: ${keptLabel}`)
    }

    return { pairsFound: pairs.length, discarded, awaitingChoice, log }
}
