import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GMAIL_SCOPES } from '@/lib/constants'

/**
 * Gmail Connection - Initiates OAuth flow for Gmail access
 *
 * This is SEPARATE from user authentication.
 * User must be logged in first, then they connect their Gmail account.
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Deve iniciar sessão primeiro' },
        { status: 401 }
      )
    }

    // Check if required environment variables are set
    if (!process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) {
      return NextResponse.json(
        { error: 'Google OAuth não está configurado' },
        { status: 500 }
      )
    }

    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`

    // Build Google OAuth URL for Gmail access
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: GMAIL_SCOPES,
      access_type: 'offline',
      prompt: 'consent', // Always prompt to ensure we get refresh token
      state: user.id, // Pass user ID to callback for verification
    })

    const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`

    return NextResponse.redirect(authUrl)
  } catch (error) {
    console.error('[Gmail Connect] Error:', error)
    return NextResponse.json(
      { error: 'Falha ao iniciar ligação Gmail' },
      { status: 500 }
    )
  }
}
