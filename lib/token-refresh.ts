import { google } from 'googleapis'

export async function refreshAccessToken(refreshToken: string): Promise<string> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/callback`
  )

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  try {
    const { credentials } = await oauth2Client.refreshAccessToken()

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token - no access token in response')
    }

    return credentials.access_token
  } catch (error) {
    throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
  }
}

export async function getValidAccessToken(
  currentToken: string | null,
  refreshToken: string | null,
  tokenExpiry: string | null
): Promise<{ accessToken: string; needsUpdate: boolean; newExpiry?: string }> {
  // If no refresh token, cannot proceed
  if (!refreshToken) {
    throw new Error('No refresh token available - please re-authenticate')
  }

  // If no current token or no expiry, refresh immediately
  if (!currentToken || !tokenExpiry) {
    const newToken = await refreshAccessToken(refreshToken)
    const newExpiry = new Date()
    newExpiry.setHours(newExpiry.getHours() + 1)
    return {
      accessToken: newToken,
      needsUpdate: true,
      newExpiry: newExpiry.toISOString(),
    }
  }

  const expiryDate = new Date(tokenExpiry)
  const now = new Date()

  // If token is expired or expires in less than 5 minutes, refresh it
  const bufferTime = 5 * 60 * 1000 // 5 minutes
  if (expiryDate.getTime() - now.getTime() < bufferTime) {
    const newToken = await refreshAccessToken(refreshToken)
    const newExpiry = new Date()
    newExpiry.setHours(newExpiry.getHours() + 1)
    return {
      accessToken: newToken,
      needsUpdate: true,
      newExpiry: newExpiry.toISOString(),
    }
  }

  return {
    accessToken: currentToken,
    needsUpdate: false,
  }
}
