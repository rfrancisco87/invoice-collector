import { NextResponse } from 'next/server'
import { Auth } from 'googleapis'
import { requireApiUser } from '@/lib/auth'
import { GMAIL_SCOPES, DRIVE_SCOPES } from '@/lib/constants'
import {
  createGmailOAuthClient,
  generateOAuthState,
  setGmailOAuthCookies,
} from '@/lib/gmail-oauth'

/**
 * Gmail Connection - Initiates OAuth flow for Gmail access
 *
 * This is SEPARATE from user authentication.
 * User must be logged in first, then they connect their Gmail account.
 */
export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
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

    // Build Google OAuth URL for Gmail access
    const { searchParams } = new URL(request.url)
    const mode = searchParams.get('mode')

    // Choose scopes based on mode
    // Default to full GMAIL_SCOPES if not specified or if mode is not 'storage'
    const scope = mode === 'storage' ? DRIVE_SCOPES : GMAIL_SCOPES

    const oauth2Client = createGmailOAuthClient()

    // Random state bound to this browser via cookie (see lib/gmail-oauth.ts),
    // plus PKCE so an intercepted authorization code is useless on its own.
    const state = generateOAuthState()
    const { codeVerifier, codeChallenge } = await oauth2Client.generateCodeVerifierAsync()

    const authUrl = oauth2Client.generateAuthUrl({
      scope,
      access_type: 'offline',
      prompt: 'consent', // Always prompt to ensure we get refresh token
      state,
      code_challenge: codeChallenge,
      code_challenge_method: Auth.CodeChallengeMethod.S256,
    })

    const response = NextResponse.redirect(authUrl)
    setGmailOAuthCookies(response, state, codeVerifier)
    return response
  } catch (error) {
    console.error('[Gmail Connect] Error:', error)
    return NextResponse.json(
      { error: 'Falha ao iniciar ligação Gmail' },
      { status: 500 }
    )
  }
}
