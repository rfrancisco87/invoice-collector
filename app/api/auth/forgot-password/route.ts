import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
    RESET_TOKEN_EXPIRY_MINUTES,
    generateResetToken,
    hashToken,
    resetTokenExpiryDate,
} from '@/lib/account-tokens'
import { sendPasswordResetEmail } from '@/lib/email'

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

        const supabase = createAdminClient()

        const { data: profile } = await supabase
            .from('profiles')
            .select('id, email, status')
            .eq('email', email)
            .maybeSingle()

        const profileRow = profile as any

        // Unknown address, or an account an admin has switched off: behave
        // identically to the success path.
        if (!profileRow || profileRow.status === 'suspended') {
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
