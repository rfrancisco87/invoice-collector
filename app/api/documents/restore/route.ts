import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Restore an auto-rejected document.
 *
 * Strategy: delete the row entirely. Auto-rejected documents never made it to
 * Drive and never went through the webhook, so there's nothing to "un-reject"
 * in place — the cleanest path is to let the next sync re-ingest the source.
 *
 * Caveats the UI must communicate:
 *   - Gmail source: the attachment is still in the mailbox and will re-ingest
 *     cleanly on the next sync. Since we deleted the rejected row, the
 *     file_hash_rejected rule will no longer match.
 *   - Inbox-folder source: the original file in the Drive inbox was deleted
 *     during auto-reject cleanup, so restoration will not bring it back. The
 *     user must re-upload manually.
 *   - If the rejection was triggered by sender_blocked, the sender's
 *     reputation is unchanged. The next ingestion will auto-reject again
 *     unless the user separately clears the sender's block.
 *
 * Safety: we only restore rows that were auto-rejected (auto_action_reason IS
 * NOT NULL). Manual rejections are left alone — their Drive file was deleted
 * by the reject action, so restoring would leave a dangling record.
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
            .select('id, status, auto_action_reason, source')
            .eq('id', documentId)
            .eq('user_id', user.id)
            .maybeSingle()

        if (fetchError || !doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        // @ts-ignore
        if (doc.status !== 'rejected' || !doc.auto_action_reason) {
            return NextResponse.json(
                { error: 'Only auto-rejected documents can be restored' },
                { status: 400 },
            )
        }

        const { error: deleteError } = await supabase
            .from('documents')
            .delete()
            .eq('id', documentId)
            .eq('user_id', user.id)

        if (deleteError) {
            return NextResponse.json({ error: deleteError.message }, { status: 500 })
        }

        return NextResponse.json({
            success: true,
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
