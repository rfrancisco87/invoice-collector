import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { hashPassword } from '@/lib/password'
import { checkPasswordPolicy, hashToken } from '@/lib/account-tokens'
import { getClientIp, isRateLimited, rateLimitResponse } from '@/lib/rate-limit'

/**
 * Redeem a password reset token and set a new password.
 *
 * The token is looked up by its SHA-256 hash — the plaintext only ever existed
 * in the email — and is consumed atomically so a link cannot be replayed.
 */
export async function POST(request: Request) {
    try {
        // Tokens are long random values, so this is not about guessing them;
        // it bounds how hard anyone can hammer an unauthenticated endpoint that
        // hashes passwords (scrypt) on every valid-looking request.
        if (
            await isRateLimited([
                { key: `reset:ip:${getClientIp(request)}`, windowSeconds: 60 * 60, max: 20 },
            ])
        ) {
            return rateLimitResponse()
        }

        const body = await request.json().catch(() => ({}))
        const { token, password } = body ?? {}

        if (!token || typeof token !== 'string') {
            return NextResponse.json({ error: 'Token em falta.' }, { status: 400 })
        }

        const policy = checkPasswordPolicy(password)
        if (!policy.ok) {
            return NextResponse.json({ error: policy.error }, { status: 400 })
        }

        const supabase = createAdminClient()

        // Indexed exact-match lookup on the hash. No plaintext comparison happens
        // anywhere, so a database dump yields nothing usable.
        const { data: tokenRow } = await supabase
            .from('password_reset_tokens')
            .select('id, profile_id, expires_at, used_at')
            .eq('token_hash', hashToken(token))
            .maybeSingle()

        const row = tokenRow as any

        const invalidToken = NextResponse.json(
            { error: 'Link inválido ou expirado. Peça um novo.' },
            { status: 400 }
        )

        if (!row) return invalidToken
        if (row.used_at) return invalidToken
        if (new Date(row.expires_at) < new Date()) return invalidToken

        // forgot-password already refuses these, but a token issued before an
        // account was suspended (or before that check existed) must not work
        // either. Same response as a bad token, so nothing about the account
        // leaks.
        const [{ data: profile }, { data: credential }] = await Promise.all([
            supabase.from('profiles').select('status').eq('id', row.profile_id).maybeSingle(),
            supabase
                .from('app_credentials')
                .select('profile_id')
                .eq('profile_id', row.profile_id)
                .maybeSingle(),
        ])

        if (!profile || (profile as any).status !== 'active' || !credential) {
            return invalidToken
        }

        // Consume first, conditional on still being unused. If two requests race,
        // only one gets a row back and only that one is allowed to set a password.
        const { data: consumed } = await supabase
            .from('password_reset_tokens')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ used_at: new Date().toISOString() })
            .eq('id', row.id)
            .is('used_at', null)
            .select('id')

        if (!consumed || consumed.length === 0) return invalidToken

        // update, not upsert: a reset replaces an existing password and must
        // never create the first credential row for an account — that is how
        // a self-registered (non-invited) profile would have obtained a login.
        // The app_credentials trigger (migration 028) bumps session_version,
        // logging out every existing session for this user.
        const { error: updateError } = await supabase
            .from('app_credentials')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({
                password_hash: hashPassword(password),
                updated_at: new Date().toISOString(),
            })
            .eq('profile_id', row.profile_id)

        if (updateError) {
            console.error('[Reset Password] Failed to update credentials:', updateError)
            return NextResponse.json(
                { error: 'Não foi possível repor a palavra-passe.' },
                { status: 500 }
            )
        }

        // Deliberately no session is issued here. Whoever completes a reset has
        // to log in with the new password, which keeps a stolen reset link from
        // yielding an authenticated session in one step.
        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Reset Password] Failed:', error)
        return NextResponse.json(
            { error: 'Falha ao repor a palavra-passe.' },
            { status: 500 }
        )
    }
}
