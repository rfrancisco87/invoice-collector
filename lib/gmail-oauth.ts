/**
 * Shared pieces of the Gmail/Drive connect flow (app/api/gmail/connect and
 * app/api/gmail/callback).
 *
 * The OAuth `state` used to be the user's id. That is guessable and carries no
 * proof that the browser finishing the flow is the one that started it, so an
 * attacker could complete their own Google consent and have the callback bind
 * *their* mailbox to a victim's session (login CSRF / account binding).
 *
 * Now `state` is 32 random bytes held in a short-lived httpOnly cookie that only
 * the callback path receives, and the PKCE code_verifier sits in a sibling
 * cookie. The callback must see both, and the user id always comes from the
 * session, never from anything in the URL.
 */

import { randomBytes, timingSafeEqual } from 'crypto'
import { google } from 'googleapis'
import type { NextResponse } from 'next/server'

export const GMAIL_OAUTH_CALLBACK_PATH = '/api/gmail/callback'
export const GMAIL_OAUTH_STATE_COOKIE = 'gmail_oauth_state'
export const GMAIL_OAUTH_VERIFIER_COOKIE = 'gmail_oauth_verifier'

/** Long enough to read a consent screen, short enough that a leaked value goes stale. */
const COOKIE_MAX_AGE_SECONDS = 10 * 60

export function gmailOAuthRedirectUri(): string {
    return `${process.env.NEXT_PUBLIC_APP_URL}${GMAIL_OAUTH_CALLBACK_PATH}`
}

export function createGmailOAuthClient() {
    return new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        gmailOAuthRedirectUri()
    )
}

export function generateOAuthState(): string {
    return randomBytes(32).toString('base64url')
}

function cookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        // lax, not strict: the callback is a top-level cross-site redirect from
        // accounts.google.com, which strict would strip the cookie from.
        sameSite: 'lax' as const,
        path: GMAIL_OAUTH_CALLBACK_PATH,
        maxAge,
    }
}

export function setGmailOAuthCookies(
    response: NextResponse,
    state: string,
    codeVerifier: string
): void {
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, state, cookieOptions(COOKIE_MAX_AGE_SECONDS))
    response.cookies.set(GMAIL_OAUTH_VERIFIER_COOKIE, codeVerifier, cookieOptions(COOKIE_MAX_AGE_SECONDS))
}

/** Single use: cleared on every callback outcome so a state can't be replayed. */
export function clearGmailOAuthCookies(response: NextResponse): void {
    response.cookies.set(GMAIL_OAUTH_STATE_COOKIE, '', cookieOptions(0))
    response.cookies.set(GMAIL_OAUTH_VERIFIER_COOKIE, '', cookieOptions(0))
}

export function stateMatches(received: string | null, expected: string | undefined): boolean {
    if (!received || !expected) return false

    const a = Buffer.from(received)
    const b = Buffer.from(expected)

    // timingSafeEqual throws on length mismatch; a different length is simply
    // a mismatch, and length alone reveals nothing about a random value.
    return a.length === b.length && timingSafeEqual(a, b)
}
