import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'

export const dynamic = 'force-dynamic'

/**
 * Gmail OAuth Callback
 *
 * Handles the callback from Google after user authorizes Gmail access.
 * Stores tokens in gmail_accounts table for the authenticated user.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const code = url.searchParams.get('code')
    const state = url.searchParams.get('state') // User ID from connect route
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

    // Verify user is authenticated and matches state
    const user = await requireApiUser()
    const supabase = await createClient()

    if (!user || user.id !== state) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_APP_URL}/login?error=session_mismatch`
      )
    }

    // Exchange authorization code for tokens
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`
    )

    const { tokens } = await oauth2Client.getToken(code)

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
    const userInfo = await oauth2.userinfo.get()
    const gmailEmail = userInfo.data.email

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
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
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
