import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createFolderStructure } from '@/lib/google-drive'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { folderId, folderName, folderPath } = body

    if (!folderId || typeof folderId !== 'string') {
      return NextResponse.json(
        { error: 'Folder ID is required' },
        { status: 400 }
      )
    }

    // Get Gmail account with access token
    const { data: gmailAccount, error: gmailError } = await supabase
      .from('gmail_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (gmailError || !gmailAccount) {
      return NextResponse.json(
        { error: 'Gmail account not found' },
        { status: 404 }
      )
    }

    // Create subfolder structure if selecting existing folder
    try {
      await createFolderStructure(gmailAccount.access_token, folderId)
    } catch (error) {
      console.log('Subfolder structure may already exist:', error)
      // Continue anyway - subfolders might already exist
    }

    // Save folder selection to user_settings
    const { error } = await supabase
      .from('user_settings')
      .update({
        drive_folder_id: folderId,
        drive_folder_name: folderName,
        drive_folder_path: folderPath,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating user settings:', error)
      return NextResponse.json(
        { error: 'Failed to save folder selection' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error saving Drive folder:', error)
    return NextResponse.json(
      { error: 'Failed to save Drive folder' },
      { status: 500 }
    )
  }
}
