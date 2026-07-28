import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateInviteCode, inviteExpiryDate } from '@/lib/account-tokens'
import { sendInviteEmail } from '@/lib/email'

/**
 * Admin invite management.
 *
 * Middleware already blocks /api/admin/* for non-admins, but the role is
 * re-checked here: a route that grants account creation should not depend on a
 * matcher pattern staying correct.
 */
async function requireAdmin() {
    const user = await requireApiUser()
    if (!user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
    if (user.role !== 'admin') {
        return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
    }
    return { user }
}

/** Derive display status without storing it — every input is already on the row. */
function inviteStatus(invite: any): 'used' | 'revoked' | 'expired' | 'active' {
    if (invite.used_at) return 'used'
    if (invite.revoked_at) return 'revoked'
    if (new Date(invite.expires_at) < new Date()) return 'expired'
    return 'active'
}

export async function GET() {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error

    const supabase = createAdminClient()

    const { data, error } = await supabase
        .from('invite_codes')
        .select('id, code, email, used_at, revoked_at, expires_at, created_at, used_by')
        .order('created_at', { ascending: false })
        .limit(100)

    if (error) {
        console.error('[Admin Invites] List failed:', error)
        return NextResponse.json({ error: 'Failed to list invites' }, { status: 500 })
    }

    const invites = ((data as any[]) ?? []).map((invite) => ({
        ...invite,
        status: inviteStatus(invite),
    }))

    return NextResponse.json({ invites })
}

export async function POST(request: Request) {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error

    try {
        const body = await request.json().catch(() => ({}))
        const rawEmail = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''
        const pinnedEmail = rawEmail || null

        if (pinnedEmail && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(pinnedEmail)) {
            return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
        }

        const supabase = createAdminClient()

        if (pinnedEmail) {
            const { data: existing } = await supabase
                .from('profiles')
                .select('id')
                .eq('email', pinnedEmail)
                .maybeSingle()

            if (existing) {
                return NextResponse.json(
                    { error: 'Já existe uma conta com este email.' },
                    { status: 409 }
                )
            }
        }

        // The unique constraint on `code` is the real guard; retrying a couple of
        // times keeps a one-in-a-trillion collision from surfacing as an error.
        let created: any = null
        let lastError: unknown = null

        for (let attempt = 0; attempt < 3 && !created; attempt++) {
            const { data, error } = await supabase
                .from('invite_codes')
                // @ts-ignore - Supabase row types infer as never across this project
                .insert({
                    code: generateInviteCode(),
                    email: pinnedEmail,
                    created_by: auth.user.id,
                    expires_at: inviteExpiryDate().toISOString(),
                })
                .select('id, code, email, expires_at, created_at')
                .single()

            if (data) created = data
            else lastError = error
        }

        if (!created) {
            console.error('[Admin Invites] Create failed:', lastError)
            return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
        }

        // Emailing is best-effort. The admin always gets the code back in the
        // response, so a mail failure must not lose the invite that was just
        // written to the database.
        let emailed = false
        if (pinnedEmail) {
            try {
                await sendInviteEmail(pinnedEmail, created.code, new Date(created.expires_at))
                emailed = true
            } catch (error) {
                console.error('[Admin Invites] Failed to email invite:', error)
            }
        }

        return NextResponse.json({
            invite: { ...created, status: 'active' },
            emailed,
        })
    } catch (error) {
        console.error('[Admin Invites] Create failed:', error)
        return NextResponse.json({ error: 'Failed to create invite' }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    const auth = await requireAdmin()
    if ('error' in auth) return auth.error

    try {
        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) {
            return NextResponse.json({ error: 'Missing invite id' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Revoke rather than delete: a redeemed code is the audit trail for how
        // an account came to exist. Only unused codes can be revoked.
        const { data, error } = await supabase
            .from('invite_codes')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ revoked_at: new Date().toISOString() })
            .eq('id', id)
            .is('used_at', null)
            .select('id')

        if (error) {
            console.error('[Admin Invites] Revoke failed:', error)
            return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 })
        }

        if (!data || data.length === 0) {
            return NextResponse.json(
                { error: 'Convite não encontrado ou já utilizado.' },
                { status: 404 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Admin Invites] Revoke failed:', error)
        return NextResponse.json({ error: 'Failed to revoke invite' }, { status: 500 })
    }
}
