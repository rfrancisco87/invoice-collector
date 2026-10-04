import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { listDriveFolders, getFolderHierarchy } from '@/lib/google-drive'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'

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

    // Stored tokens are encrypted; this decrypts, refreshes if needed and
    // persists any refreshed token encrypted.
    const accessToken = await getValidGmailAccessToken(supabase, gmailAccount)

    const { searchParams } = new URL(request.url)
    const resolvePath = searchParams.get('resolvePath')
    const folderId = searchParams.get('folderId')

    if (resolvePath && folderId) {
      const hierarchy = await getFolderHierarchy(accessToken, folderId)
      return NextResponse.json({ hierarchy })
    }

    const parentId = searchParams.get('parentId') || 'root'

    const folders = await listDriveFolders(accessToken, parentId)

    return NextResponse.json({ folders })
  } catch (error) {
    console.error('Error listing Drive folders:', error)
    return NextResponse.json(
      { error: 'Failed to list Drive folders', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
