import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createDriveFolder, createFolderStructure } from '@/lib/google-drive'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { name } = body

    if (!name || typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Folder name is required' },
        { status: 400 }
      )
    }

    // Get Gmail account with access token
    const { data: gmailAccount, error } = await supabase
      .from('gmail_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (error || !gmailAccount) {
      return NextResponse.json(
        { error: 'Gmail account not found' },
        { status: 404 }
      )
    }

    // Create the main folder
    const folder = await createDriveFolder(gmailAccount.access_token, name)

    // Create subfolder structure (Pending Approval, Approved)
    await createFolderStructure(gmailAccount.access_token, folder.id)

    return NextResponse.json({ folder })
  } catch (error) {
    console.error('Error creating Drive folder:', error)
    return NextResponse.json(
      { error: 'Failed to create Drive folder' },
      { status: 500 }
    )
  }
}
