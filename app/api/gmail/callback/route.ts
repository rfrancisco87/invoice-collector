import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { encryptToken } from '@/lib/gmail-tokens'
import {
  GMAIL_OAUTH_STATE_COOKIE,
  GMAIL_OAUTH_VERIFIER_COOKIE,
  clearGmailOAuthCookies,
  createGmailOAuthClient,
  stateMatches,
} from '@/lib/gmail-oauth'

export const dynamic = 'force-dynamic'

/**
 * Gmail OAuth Callback
 *
 * Handles the callback from Google after user authorizes Gmail access.
 * Stores tokens (encrypted) in gmail_accounts table for the authenticated user.
 */
export async function GET(request: Request) {
  const response = await handleCallback(request)
  // The state/verifier cookies are single use whatever the outcome.
  clearGmailOAuthCookies(response)
  return response
}

async function handleCallback(request: Request): Promise<NextResponse> {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state')
    const error = url.searchParams.get('error')

    // Handle OAuth errors
    if (error) {
      console.error('[Gmail Callback] OAuth error:', error)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=oauth_denied`
      )
    }

    if (!code || !state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=missing_params`
      )
    }

    // The account is bound to whoever holds this session — never to anything
    // carried in the URL, which an attacker controls.
    const user = await requireApiUser()
    const supabase = await createClient()

    if (!user) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=session_mismatch`
      )
    }

    // The state must match the one this browser was given by /api/gmail/connect.
    // A mismatch means the flow was started elsewhere (e.g. an attacker's
    // consent link replayed into the victim's session), so refuse to bind it.
    const cookieStore = await cookies()
    const expectedState = cookieStore.get(GMAIL_OAUTH_STATE_COOKIE)?.value
    const codeVerifier = cookieStore.get(GMAIL_OAUTH_VERIFIER_COOKIE)?.value

    if (!stateMatches(state, expectedState) || !codeVerifier) {
      console.warn('[Gmail Callback] OAuth state mismatch or missing verifier')
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=state_mismatch`
      )
    }

    // Exchange authorization code for tokens
    const oauth2Client = createGmailOAuthClient()

    // Exchanging the code is the step most likely to fail, and it fails for
    // reasons the user can act on (a reused code after a refresh, a stale
    // client secret). Collapsing those into the generic catch below left no
    // way to tell them apart from the logs.
    let tokens
    try {
      ({ tokens } = await oauth2Client.getToken({ code, codeVerifier }))
    } catch (exchangeError: any) {
      const detail = exchangeError?.response?.data ?? exchangeError?.message
      console.error('[Gmail Callback] Code exchange failed:', detail)

      const googleError = String(exchangeError?.response?.data?.error ?? '')
      const reason =
        googleError === 'invalid_grant'
          ? 'code_expired'
          : googleError === 'redirect_uri_mismatch'
            ? 'redirect_mismatch'
            : googleError === 'invalid_client'
              ? 'bad_client'
              : 'exchange_failed'

      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=${reason}`
      )
    }

    if (!tokens.access_token || !tokens.refresh_token) {
      console.error('[Gmail Callback] Missing tokens:', {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token
      })
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=missing_tokens`
      )
    }

    // Get user's email address
    // We use oauth2.userinfo instead of gmail.users.getProfile because
    // getProfile requires https://www.googleapis.com/auth/gmail.readonly scope
    // which we might not have if the user selected 'storage' mode.
    oauth2Client.setCredentials(tokens)
    const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client })

    let gmailEmail: string | null | undefined
    try {
      const userInfo = await oauth2.userinfo.get()
      gmailEmail = userInfo.data.email
    } catch (userInfoError: any) {
      console.error(
        '[Gmail Callback] userinfo lookup failed:',
        userInfoError?.response?.data ?? userInfoError?.message
      )
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=userinfo_failed`
      )
    }

    if (!gmailEmail) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=no_email`
      )
    }

    // Calculate token expiry
    const tokenExpiry = tokens.expiry_date
      ? new Date(tokens.expiry_date).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString() // Default 1 hour

    // Upsert gmail_account (update if exists, insert if not)
    const { error: upsertError } = await supabase
      .from('gmail_accounts')
      .upsert({
        user_id: user.id,
        email: gmailEmail,
        // Encrypted at rest; see lib/gmail-tokens.ts.
        access_token: encryptToken(tokens.access_token),
        refresh_token: encryptToken(tokens.refresh_token),
        token_expiry: tokenExpiry,
        is_primary: true,
      }, {
        onConflict: 'user_id',
      })

    if (upsertError) {
      console.error('[Gmail Callback] Database error:', upsertError)
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=db_error`
      )
    }

    // Check if user has Drive folder configured
    const { data: settings } = await supabase
      .from('user_settings')
      .select('drive_folder_id')
      .eq('user_id', user.id)
      .single()

    // Redirect to setup if no Drive folder, otherwise dashboard
    const redirectPath = settings?.drive_folder_id ? '/dashboard' : '/setup'

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}${redirectPath}?gmail=connected`
    )

  } catch (error) {
    console.error('[Gmail Callback] Error:', error)
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/gmail-connect?error=callback_failed`
    )
  }
}
