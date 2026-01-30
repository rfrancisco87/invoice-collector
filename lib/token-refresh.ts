import { google } from 'googleapis'

export async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string
  expiryDate?: number
}> {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/gmail/callback`
  )

  oauth2Client.setCredentials({
    refresh_token: refreshToken,
  })

  try {
    const { credentials } = await oauth2Client.refreshAccessToken()

    if (!credentials.access_token) {
      throw new Error('Failed to refresh access token - no access token in response')
    }

    return {
      accessToken: credentials.access_token,
      expiryDate: credentials.expiry_date || undefined,
    }
  } catch (error) {
    console.error('[Token Refresh] Error:', error)
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
    throw new Error('No refresh token available - please reconnect your Gmail account')
  }

  // If no current token or no expiry, refresh immediately
  if (!currentToken || !tokenExpiry) {
    console.log('[Token Refresh] No current token or expiry, refreshing...')
    const result = await refreshAccessToken(refreshToken)
    const newExpiry = result.expiryDate
      ? new Date(result.expiryDate).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString() // Default 1 hour

    return {
      accessToken: result.accessToken,
      needsUpdate: true,
      newExpiry,
    }
  }

  const expiryDate = new Date(tokenExpiry)
  const now = new Date()

  // If token is expired or expires in less than 5 minutes, refresh it
  const bufferTime = 5 * 60 * 1000 // 5 minutes
  if (expiryDate.getTime() - now.getTime() < bufferTime) {
    console.log('[Token Refresh] Token expired or expiring soon, refreshing...')
    const result = await refreshAccessToken(refreshToken)
    const newExpiry = result.expiryDate
      ? new Date(result.expiryDate).toISOString()
      : new Date(Date.now() + 3600 * 1000).toISOString() // Default 1 hour

    return {
      accessToken: result.accessToken,
      needsUpdate: true,
      newExpiry,
    }
  }

  console.log('[Token Refresh] Token still valid, using current token')
  return {
    accessToken: currentToken,
    needsUpdate: false,
  }
}
