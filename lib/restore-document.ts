import type { SupabaseClient } from '@supabase/supabase-js'
import { calculateFileHash, fetchMessageAttachments, getGmailClient } from '@/lib/gmail'
import { getDriveClient } from '@/lib/google-drive'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'
import { ingestDocument } from '@/lib/ingestion'

export type RestoreOutcome =
    | { ok: true; documentId: string }
    | { ok: false; status: number; error: string }

/**
 * Bring an auto-rejected document back as a pending one.
 *
 * Auto-rejected documents were never uploaded to Pending, so the file is
 * fetched again from where it came from — the Gmail message, or the inbox
 * original (kept in the Drive trash) — and run through ingestion with the
 * auto-decision rules switched off. This used to be "delete the row and wait
 * for the next sync", which only worked while the email was still inside the
 * sync lookback window and never worked for inbox files.
 *
 * The rejected row is removed before ingesting (otherwise the duplicate and
 * file_hash_rejected checks would match it) and put back if ingestion does
 * not produce a pending document, so a failed restore loses nothing.
 */
export async function restoreAutoRejectedDocument(
    supabase: SupabaseClient,
    userId: string,
    documentId: string,
): Promise<RestoreOutcome> {
    const { data: doc } = await supabase
        .from('documents')
        .select('*')
        .eq('id', documentId)
        .eq('user_id', userId)
        .maybeSingle()

    if (!doc) return { ok: false, status: 404, error: 'Document not found' }
    if (doc.status !== 'rejected' || !doc.auto_action_reason) {
        return { ok: false, status: 400, error: 'Not an auto-rejected document' }
    }

    const [{ data: settings }, { data: gmailAccount }] = await Promise.all([
        supabase.from('user_settings').select('*').eq('user_id', userId).maybeSingle(),
        supabase
            .from('gmail_accounts')
            .select('id, user_id, access_token, refresh_token, token_expiry')
            .eq('user_id', userId)
            .maybeSingle(),
    ])
    if (!settings?.drive_folder_id) {
        return { ok: false, status: 400, error: 'Drive folder not configured' }
    }
    if (!gmailAccount) return { ok: false, status: 404, error: 'Gmail account not found' }

    const providerToken = await getValidGmailAccessToken(supabase, gmailAccount as any)

    const file = await fetchOriginal(doc, providerToken)
    if (!file) {
        return {
            ok: false,
            status: 409,
            error: doc.source === 'inbox_folder'
                ? 'O ficheiro original já não existe no Drive — tem de voltar a carregá-lo'
                : 'O anexo já não existe no email original',
        }
    }

    const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id)
        .eq('user_id', userId)
    if (deleteError) return { ok: false, status: 500, error: deleteError.message }

    let failure: string
    try {
        const result = await ingestDocument(
            { user: { id: userId }, settings, gmailAccount, providerToken, skipAutoDecision: true },
            file.data,
            doc.filename,
            {
                emailMessageId: doc.email_message_id,
                subject: doc.subject ?? '',
                sender: doc.sender ?? '',
                senderDomain: doc.sender_domain ?? '',
                receivedDate: new Date(doc.received_date),
                source: doc.source,
                inboxFileId: doc.inbox_file_id ?? undefined,
            },
        )
        if (result.action === 'processed' && result.documentId) {
            return { ok: true, documentId: result.documentId }
        }
        failure = result.details || result.action
    } catch (err) {
        failure = err instanceof Error ? err.message : String(err)
    }

    const { error: reinsertError } = await supabase
        .from('documents')
        .insert({ ...doc, user_id: userId })
    if (reinsertError) {
        console.error(`[Restore] Failed to put back rejected row ${doc.id}:`, reinsertError)
    }
    return { ok: false, status: 500, error: `Falha ao reprocessar: ${failure}` }
}

async function fetchOriginal(doc: any, providerToken: string): Promise<{ data: Buffer } | null> {
    if (doc.source === 'inbox_folder') {
        if (!doc.inbox_file_id) return null
        try {
            const drive = await getDriveClient(providerToken)
            // Works on trashed files too, which is where the original sits.
            const response = await drive.files.get(
                { fileId: doc.inbox_file_id, alt: 'media' },
                { responseType: 'arraybuffer' },
            )
            const data = Buffer.from(response.data as ArrayBuffer)
            return data.length > 0 ? { data } : null
        } catch (err: any) {
            const status = err?.code ?? err?.response?.status
            if (status === 404) return null
            throw err
        }
    }

    if (doc.source === 'gmail') {
        const gmail = await getGmailClient(providerToken)
        let attachments
        try {
            attachments = await fetchMessageAttachments(gmail, doc.email_message_id)
        } catch (err: any) {
            const status = err?.code ?? err?.response?.status
            if (status === 404) return null
            throw err
        }
        // Prefer the exact bytes that were rejected; fall back to the filename.
        const match =
            attachments.find((a) => calculateFileHash(a.data) === doc.file_hash) ??
            attachments.find((a) => a.filename === doc.filename)
        return match ? { data: match.data } : null
    }

    return null
}
