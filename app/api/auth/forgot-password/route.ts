import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    RESET_TOKEN_EXPIRY_MINUTES,
    generateResetToken,
    hashToken,
    resetTokenExpiryDate,
} from '@/lib/account-tokens'
import { sendPasswordResetEmail } from '@/lib/email'
import { getClientIp, isRateLimited, rateLimitResponse } from '@/lib/rate-limit'

const WINDOW_SECONDS = 60 * 60

/**
 * Request a password reset link.
 *
 * Always answers 200 with the same body, whether or not the address exists.
 * This endpoint is unauthenticated and public, so a response that varied by
 * account existence would be an account enumeration oracle — anyone could
 * discover who uses the app by submitting addresses.
 */
export async function POST(request: Request) {
    const genericResponse = NextResponse.json({
        success: true,
        message:
            'Se existir uma conta com esse email, enviámos um link para repor a palavra-passe.',
    })

    try {
        const body = await request.json().catch(() => ({}))
        const email = typeof body?.email === 'string' ? body.email.trim().toLowerCase() : ''

        if (!email) return genericResponse

        // Each accepted request sends an email, so this doubles as protection
        // against using the app to flood someone's inbox. The 429 is the same
        // for known and unknown addresses.
        const ip = getClientIp(request)
        if (
            await isRateLimited([
                { key: `forgot:email:${email}`, windowSeconds: WINDOW_SECONDS, max: 3 },
                { key: `forgot:ip:${ip}`, windowSeconds: WINDOW_SECONDS, max: 10 },
            ])
        ) {
            return rateLimitResponse()
        }

        const supabase = createAdminClient()

        const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, status')
            .eq('email', email)
            .maybeSingle()

        const profileRow = profile as any

        // Unknown address, or any account that is not 'active': behave
        // identically to the success path. Non-active includes 'invited'
        // profiles, which is what a direct supabase.auth.signUp() with the
        // public anon key produces — issuing a reset link there would let a
        // self-registered user mint credentials and bypass invite-only signup.
        if (!profileRow || profileRow.status !== 'active') {
            return genericResponse
        }

        // A reset may only change an existing password, never create the first
        // one. Every legitimate account gets credentials at signup.
        const { data: credential } = await supabase
            .from('app_credentials')
            .select('profile_id')
            .eq('profile_id', profileRow.id)
            .maybeSingle()

        if (!credential) {
            return genericResponse
        }

        // Invalidate any outstanding tokens for this account. Requesting a new
        // link should retire the previous one, so a leaked older email cannot
        // still be used.
        await supabase
            .from('password_reset_tokens')
            // @ts-ignore - Supabase row types infer as never across this project
            .update({ used_at: new Date().toISOString() })
            .eq('profile_id', profileRow.id)
            .is('used_at', null)

        const token = generateResetToken()

        const { error: insertError } = await supabase
            .from('password_reset_tokens')
            // @ts-ignore - Supabase row types infer as never across this project
            .insert({
                profile_id: profileRow.id,
                token_hash: hashToken(token),
                expires_at: resetTokenExpiryDate().toISOString(),
            })

        if (insertError) {
            console.error('[Forgot Password] Failed to store token:', insertError)
            return genericResponse
        }

        try {
            await sendPasswordResetEmail(profileRow.email, token, RESET_TOKEN_EXPIRY_MINUTES)
        } catch (error) {
            // Logged, not surfaced: reporting a mail failure here would leak that
            // the address is registered.
            console.error('[Forgot Password] Failed to send email:', error)
        }

        return genericResponse
    } catch (error) {
        console.error('[Forgot Password] Failed:', error)
        return genericResponse
    }
}
