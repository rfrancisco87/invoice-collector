import { NextResponse } from 'next/server'
import { applyLoginSession } from '@/lib/auth'
import { hashPassword } from '@/lib/password'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkPasswordPolicy, normaliseInviteCode } from '@/lib/account-tokens'

/**
 * Invite-only signup.
 *
 * Redeeming a code creates the full account in one request:
 *
 *   auth.users  — via auth.admin.createUser(). Every table in this schema
 *                 foreign-keys to auth.users, so the identity has to originate
 *                 there. The handle_new_user() trigger creates the profile row.
 *   profiles    — created by that trigger, then stamped with invited_by.
 *   app_credentials — the scrypt hash the login route actually checks.
 *   user_settings   — an empty defaults row, so every downstream route that
 *                 does `.single()` on settings finds something.
 *
 * There is no email verification step: possession of an invite code is the
 * proof of invitation, and codes can be pinned to a specific address.
 */
export async function POST(request: Request) {
    try {
        const body = await request.json()
        const { email, password, fullName, inviteCode } = body ?? {}

        if (!email || !password || !inviteCode) {
            return NextResponse.json(
                { error: 'Email, palavra-passe e código de convite são obrigatórios.' },
                { status: 400 }
            )
        }

        const policy = checkPasswordPolicy(password)
        if (!policy.ok) {
            return NextResponse.json({ error: policy.error }, { status: 400 })
        }

        const normalisedEmail = String(email).trim().toLowerCase()
        const normalisedCode = normaliseInviteCode(String(inviteCode))

        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalisedEmail)) {
            return NextResponse.json({ error: 'Email inválido.' }, { status: 400 })
        }

        const supabase = createAdminClient()

        // --- Validate the invite ------------------------------------------------

        const { data: invite } = await supabase
            .from('invite_codes')
            .select('*')
            .eq('code', normalisedCode)
            .maybeSingle()

        const inviteRow = invite as any

        // One generic message for every invite failure. Distinguishing "expired"
        // from "already used" from "no such code" tells an attacker which codes
        // exist.
        const invalidInvite = NextResponse.json(
            { error: 'Código de convite inválido ou expirado.' },
            { status: 400 }
        )

        if (!inviteRow) return invalidInvite
        if (inviteRow.used_at) return invalidInvite
        if (inviteRow.revoked_at) return invalidInvite
        if (new Date(inviteRow.expires_at) < new Date()) return invalidInvite

        // A code may be pinned to one address.
        if (inviteRow.email && inviteRow.email.trim().toLowerCase() !== normalisedEmail) {
            return invalidInvite
        }

        // --- Reject duplicates before creating anything -------------------------

        const { data: existingProfile } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', normalisedEmail)
            .maybeSingle()

        if (existingProfile) {
            return NextResponse.json(
                { error: 'Já existe uma conta com este email.' },
                { status: 409 }
            )
        }

        // --- Create the identity ------------------------------------------------

        const { data: created, error: createError } = await supabase.auth.admin.createUser({
            email: normalisedEmail,
            email_confirm: true,
            user_metadata: fullName ? { full_name: String(fullName).trim() } : undefined,
        })

        if (createError || !created?.user) {
            console.error('[Signup] Failed to create auth user:', createError)
            return NextResponse.json(
                { error: 'Não foi possível criar a conta.' },
                { status: 500 }
            )
        }

        const userId = created.user.id

        // Everything past this point has already consumed a real auth.users row.
        // If any step fails we delete that user again rather than leave a
        // half-built account that can never log in (no credentials) and blocks
        // the email from being retried.
        const rollback = async (reason: string, error: unknown) => {
            console.error(`[Signup] ${reason}:`, error)
            await supabase.auth.admin.deleteUser(userId).catch((cleanupError) => {
                console.error('[Signup] Rollback failed, orphaned auth user:', userId, cleanupError)
            })
        }

        // handle_new_user() creates the profile row on insert into auth.users.
        // Stamp the invite trail onto it.
        const { error: profileError } = await supabase
            .from('profiles')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({
                status: 'active',
                invited_by: inviteRow.created_by,
                full_name: fullName ? String(fullName).trim() : null,
            })
            .eq('id', userId)

        if (profileError) {
            await rollback('Failed to update profile', profileError)
            return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 })
        }

        const { error: credentialError } = await supabase
            .from('app_credentials')
            // @ts-ignore - Supabase row types infer as never across this project
            .insert({
                profile_id: userId,
                password_hash: hashPassword(password),
            })

        if (credentialError) {
            await rollback('Failed to create credentials', credentialError)
            return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 })
        }

        // Defaults row. Without it, routes that do `.single()` on user_settings
        // 404 immediately after signup.
        const { error: settingsError } = await supabase
            .from('user_settings')
            // @ts-ignore - Supabase row types infer as never across this project
            .insert({ user_id: userId })

        if (settingsError) {
            await rollback('Failed to create user settings', settingsError)
            return NextResponse.json({ error: 'Não foi possível criar a conta.' }, { status: 500 })
        }

        // --- Burn the invite ----------------------------------------------------

        // Conditional on used_at still being NULL, so two simultaneous redemptions
        // of the same code cannot both succeed.
        const { data: claimed } = await supabase
            .from('invite_codes')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ used_by: userId, used_at: new Date().toISOString() })
            .eq('id', inviteRow.id)
            .is('used_at', null)
            .select('id')

        if (!claimed || claimed.length === 0) {
            await rollback('Invite was consumed concurrently', null)
            return invalidInvite
        }

        return await applyLoginSession(
            NextResponse.json({ success: true }),
            userId
        )
    } catch (error) {
        console.error('[Signup] Failed:', error)
        return NextResponse.json({ error: 'Falha ao criar conta.' }, { status: 500 })
    }
}
