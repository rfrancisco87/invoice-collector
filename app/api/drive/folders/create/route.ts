import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createDriveFolder, createFolderStructure } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const body = await request.json()
    const { name, parentId } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      )
    }

    // Get Gmail account with access token
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

    // Create the main folder
    const folder = await createDriveFolder(tokenResult.accessToken, name, parentId)

    // Create subfolder structure (Pending Approval, Approved)
    await createFolderStructure(tokenResult.accessToken, folder.id)

    return NextResponse.json({ folder })
  } catch (error) {
    console.error('Error creating Drive folder:', error)
    return NextResponse.json(
      { error: 'Failed to create Drive folder' },
      { status: 500 }
    )
  }
}
