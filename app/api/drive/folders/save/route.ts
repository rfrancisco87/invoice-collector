import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { createFolderStructure } from '@/lib/google-drive'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const body = await request.json()
    const { folderId, folderName, folderPath, createInbox } = body

    if (!folderId || typeof folderId !== 'string') {
      return NextResponse.json(
        { error: 'Folder ID is required' },
        { status: 400 }
      )
    }

    // Get Gmail account with access token
    const { data: gmailAccount, error: gmailError } = await supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (gmailError || !gmailAccount) {
      // If we don't have a gmail account (e.g. only manual upload + forwarding?),
      // we can't create drive folders automatically unless we have SOME token.
      // But the wizard forces "Connect Account" before this step if any Drive logic is needed.
      return NextResponse.json(
        { error: 'Gmail/Drive account not connected' },
        { status: 404 }
      )
    }

    // Stored tokens are encrypted; this decrypts, refreshes if needed and
    // persists any refreshed token encrypted.
    const accessToken = await getValidGmailAccessToken(supabase, gmailAccount)

    // Create subfolder structure
    let inboxId: string | undefined
    try {
      const structure = await createFolderStructure(
        accessToken,
        folderId,
        !!createInbox // Pass true if inbox requested
      )
      inboxId = structure.inboxId
    } catch (error) {
      console.log('Subfolder structure creation error:', error)
      // We might continue or fail? Better to warn but save main folder
    }

    // Prepare update payload
    const updatePayload: any = {
      drive_folder_id: folderId,
      drive_folder_name: folderName,
      drive_folder_path: folderPath,
      updated_at: new Date().toISOString(),
    }

    // Create new Inbox Setting if it was requested
    if (createInbox && inboxId) {
      updatePayload.inbox_folder_id = inboxId
      updatePayload.inbox_folder_enabled = true
    }

    // Save folder selection to user_settings
    const { error } = await supabase
      .from('user_settings')
      .update(updatePayload)
      .eq('user_id', user.id)

    if (error) {
      console.error('Error updating user settings:', error)
      return NextResponse.json(
        { error: 'Failed to save folder selection' },
        { status: 500 }
      )
    }

    return NextResponse.json({ success: true, inboxId })
  } catch (error) {
    console.error('Error saving Drive folder:', error)
    return NextResponse.json(
      { error: 'Failed to save Drive folder' },
      { status: 500 }
    )
  }
}
