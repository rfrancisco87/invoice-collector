import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listDriveFolders, getFolderHierarchy } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'

export async function GET(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

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
        .eq('user_id', user.id)
    }

    const { searchParams } = new URL(request.url)
    const resolvePath = searchParams.get('resolvePath')
    const folderId = searchParams.get('folderId')

    if (resolvePath && folderId) {
      const hierarchy = await getFolderHierarchy(tokenResult.accessToken, folderId)
      return NextResponse.json({ hierarchy })
    }

    const parentId = searchParams.get('parentId') || 'root'

    const folders = await listDriveFolders(tokenResult.accessToken, parentId)

    return NextResponse.json({ folders })
  } catch (error) {
    console.error('Error listing Drive folders:', error)
    return NextResponse.json(
      { error: 'Failed to list Drive folders', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
