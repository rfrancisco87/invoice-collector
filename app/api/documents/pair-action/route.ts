import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google-drive'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'

/**
 * Resolve an invoice/receipt pair the user was asked to decide.
 *
 * Takes one document id from the pair plus which side to keep, and settles both
 * rows together. Operating on the pair rather than on a single document is the
 * point: resolving one side without the other leaves a dangling
 * 'awaiting_choice' row that the UI would keep prompting about.
 */
export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { documentId, keep } = await request.json()

        if (!documentId || !['invoice', 'receipt', 'both'].includes(keep)) {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
        }

        const supabase = await createClient()

        const { data: document } = await supabase
            .from('documents')
            .select('id, variant, paired_with_id, drive_file_id, pair_state')
            .eq('id', documentId)
            .eq('user_id', user.id)
            .maybeSingle()

        const doc = document as any

        if (!doc) {
            return NextResponse.json({ error: 'Document not found' }, { status: 404 })
        }

        if (!doc.paired_with_id) {
            return NextResponse.json({ error: 'Document has no pair' }, { status: 400 })
        }

        const { data: sibling } = await supabase
            .from('documents')
            .select('id, variant, drive_file_id, pair_state')
            .eq('id', doc.paired_with_id)
            .eq('user_id', user.id)
            .maybeSingle()

        const pairDoc = sibling as any

        if (!pairDoc) {
            return NextResponse.json({ error: 'Paired document not found' }, { status: 404 })
        }

        // Work out which row is which side, rather than trusting the caller to
        // have sent the invoice.
        const invoice = doc.variant === 'invoice' ? doc : pairDoc
        const receipt = doc.variant === 'invoice' ? pairDoc : doc

        const keepIds =
            keep === 'both'
                ? [invoice.id, receipt.id]
                : keep === 'invoice'
                    ? [invoice.id]
                    : [receipt.id]

        const discardIds = [invoice.id, receipt.id].filter((id) => !keepIds.includes(id))

        await supabase
            .from('documents')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ pair_state: 'kept' })
            .in('id', keepIds)
            .eq('user_id', user.id)

        for (const discardId of discardIds) {
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
                .eq('user_id', user.id)

            const target = [invoice, receipt].find((d) => d.id === discardId)
            if (target?.drive_file_id) {
                try {
                    const { data: gmailAccount } = await supabase
                        .from('gmail_accounts')
                        .select('id, user_id, access_token, refresh_token, token_expiry')
                        .eq('user_id', user.id)
                        .maybeSingle()

                    if (gmailAccount) {
                        // Stored tokens are encrypted; never pass them to Drive raw.
                        const accessToken = await getValidGmailAccessToken(supabase, gmailAccount)
                        const drive = await getDriveClient(accessToken)
                        await drive.files.delete({ fileId: target.drive_file_id })
                    }
                } catch (err: any) {
                    // The database decision stands even if Drive cleanup fails —
                    // an orphaned file in Pending is recoverable, an inconsistent
                    // pair state is not.
                    const status = err?.code ?? err?.response?.status
                    if (status !== 404) {
                        console.error('[Pair Action] Drive cleanup failed:', err?.message || err)
                    }
                }
            }
        }

        return NextResponse.json({ success: true, kept: keepIds, discarded: discardIds })
    } catch (error) {
        console.error('[Pair Action] Failed:', error)
        return NextResponse.json({ error: 'Failed to resolve pair' }, { status: 500 })
    }
}
