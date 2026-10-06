import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google-drive'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'
import { restoreAutoRejectedDocument } from '@/lib/restore-document'

/**
 * Restore a rejected document.
 *
 * Two flavours, depending on how the document was rejected:
 *
 * Auto-rejected (auto_action_reason IS NOT NULL)
 *   The file never reached Drive, so it is fetched again from its source (the
 *   Gmail message, or the trashed inbox original) and ingested as pending.
 *   See restoreAutoRejectedDocument.
 *
 * Manually rejected (auto_action_reason IS NULL)
 *   The reject action moves the Drive file to the trash, so we untrash it
 *   (it returns to its original Pending folder), put the row back to
 *   'pending', and undo the rejection's effect on sender reputation.
 *   Drive purges trash after 30 days, and rejections made before the reject
 *   action switched to trashing hard-deleted the file — in both cases the
 *   file is gone and we refuse rather than leave a pending row with no file.
 */
export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { documentId } = await request.json()
        if (!documentId) {
            return NextResponse.json({ error: 'Missing documentId' }, { status: 400 })
        }

        const supabase = await createClient()

        // @ts-ignore - Supabase type inference is flaky in this project
        const { data: doc, error: fetchError } = await supabase
            .from('documents')
            .select('id, status, auto_action_reason, source, drive_file_id, sender_domain')
            .eq('id', documentId)
            .eq('user_id', user.id)
            .maybeSingle()

        if (fetchError || !doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // @ts-ignore
        if (doc.status !== 'rejected') {
            return NextResponse.json(
                { error: 'Only rejected documents can be restored' },
                { status: 400 },
            )
        }

        // @ts-ignore
        if (!doc.auto_action_reason) {
            return restoreManualRejection(supabase, user.id, doc)
        }

        const outcome = await restoreAutoRejectedDocument(supabase, user.id, documentId)
        if (!outcome.ok) {
            return NextResponse.json({ error: outcome.error }, { status: outcome.status })
        }

        return NextResponse.json({
            success: true,
            mode: 'reingested',
            documentId: outcome.documentId,
            // @ts-ignore
            source: doc.source,
        })
    } catch (error) {
        console.error('Restore error:', error)
        return NextResponse.json(
            { error: 'Failed to restore document' },
            { status: 500 },
        )
    }
}

async function restoreManualRejection(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    doc: any,
) {
    const fileGone = NextResponse.json(
        { error: 'O ficheiro já não existe no Drive e não pode ser restaurado' },
        { status: 409 },
    )

    if (!doc.drive_file_id) return fileGone

    // @ts-ignore - Supabase type inference is flaky in this project
    const { data: gmailAccount } = await supabase
        .from('gmail_accounts')
        .select('id, user_id, access_token, refresh_token, token_expiry')
        .eq('user_id', userId)
        .maybeSingle()

    if (!gmailAccount) {
        return NextResponse.json({ error: 'Gmail account not found' }, { status: 404 })
    }

    // Stored tokens are encrypted; this decrypts and refreshes if needed.
    const drive = await getDriveClient(await getValidGmailAccessToken(supabase, gmailAccount))

    try {
        await drive.files.update({
            fileId: doc.drive_file_id,
            requestBody: { trashed: false },
        })
    } catch (err: any) {
        const status = err?.code ?? err?.response?.status
        if (status === 404) return fileGone
        throw err
    }

    const { error: updateError } = await supabase
        .from('documents')
        // @ts-ignore - Supabase row types infer as never across this project
        .update({ status: 'pending', rejected_at: null })
        .eq('id', doc.id)
        .eq('user_id', userId)

    if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 })
    }

    await undoRejectionFeedback(supabase, userId, doc.id, doc.sender_domain)

    return NextResponse.json({ success: true, mode: 'in_place', source: doc.source })
}

/**
 * Remove the 'rejected' feedback row the reject action recorded and roll back
 * the matching increment the update_sender_reputation() trigger applied, so a
 * reverted rejection doesn't count towards blocking the sender. Best-effort:
 * the document is already restored, so failures are logged, not surfaced.
 */
async function undoRejectionFeedback(
    supabase: Awaited<ReturnType<typeof createClient>>,
    userId: string,
    documentId: string,
    senderDomain: string | null,
) {
    try {
        // @ts-ignore - Supabase type inference is flaky in this project
        const { data: deleted } = await supabase
            .from('user_feedback')
            .delete()
            .eq('user_id', userId)
            .eq('document_id', documentId)
            .eq('action', 'rejected')
            .select('id')

        if (!deleted?.length || !senderDomain) return

        // @ts-ignore
        const { data: rep } = await supabase
            .from('sender_reputation')
            .select('id, approval_count, rejection_count')
            .eq('user_id', userId)
            .eq('sender_domain', senderDomain)
            .maybeSingle()

        if (!rep) return

        // @ts-ignore
        const rejectionCount = Math.max(0, (rep.rejection_count ?? 0) - deleted.length)
        // @ts-ignore
        const approvalCount = rep.approval_count ?? 0

        // Mirrors the thresholds in update_sender_reputation().
        await supabase
            .from('sender_reputation')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({
                rejection_count: rejectionCount,
                reputation_score: approvalCount - rejectionCount,
                is_blocked: rejectionCount >= 2 && approvalCount === 0,
            })
            // @ts-ignore
            .eq('id', rep.id)
            .eq('user_id', userId)
    } catch (err) {
        console.error('[Restore] Failed to undo rejection feedback:', err)
    }
}
