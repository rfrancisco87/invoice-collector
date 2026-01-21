import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { listDriveFolders } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get Gmail account with tokens
    const { data: gmailAccount, error } = await supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error || !gmailAccount) {
      return NextResponse.json(
        { error: 'Gmail account not found' },
        { status: 404 }
      )
    }

    // Get valid access token (will refresh if needed)
    const tokenResult = await getValidAccessToken(
      gmailAccount.access_token,
      gmailAccount.refresh_token,
      gmailAccount.token_expiry
    )

    // Update database if token was refreshed
    if (tokenResult.needsUpdate && tokenResult.newExpiry) {
      await supabase
        .from('gmail_accounts')
        .update({
          access_token: tokenResult.accessToken,
          token_expiry: tokenResult.newExpiry,
        })
        .eq('id', gmailAccount.id)
    }

    const folders = await listDriveFolders(tokenResult.accessToken)

    return NextResponse.json({ folders })
  } catch (error) {
    console.error('Error listing Drive folders:', error)
    return NextResponse.json(
      { error: 'Failed to list Drive folders', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
