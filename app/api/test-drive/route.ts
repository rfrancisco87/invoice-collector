import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google-drive'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providerToken = session.provider_token

    if (!providerToken) {
      return NextResponse.json({ error: 'No provider token' }, { status: 401 })
    }

    const drive = await getDriveClient(providerToken)

    // Test 1: Get user info
    const about = await drive.about.get({ fields: 'user, storageQuota' })

    // Test 2: List root folders
    const folders = await drive.files.list({
      q: "mimeType='application/vnd.google-apps.folder' and 'root' in parents and trashed=false",
      fields: 'files(id, name)',
      pageSize: 10,
    })

    // Test 3: Get user settings for configured folder
    const { data: settings } = await supabase
      .from('user_settings')
      .select('drive_folder_id')
      .eq('user_id', session.user.id)
      .single()

    let configuredFolder = null
    if (settings?.drive_folder_id) {
      try {
        const folder = await drive.files.get({
          fileId: settings.drive_folder_id,
          fields: 'id, name, parents',
        })
        configuredFolder = {
          id: folder.data.id,
          name: folder.data.name,
          accessible: true,
        }
      } catch (err) {
        configuredFolder = {
          id: settings.drive_folder_id,
          accessible: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        }
      }
    }

    return NextResponse.json({
      success: true,
      user: {
        displayName: about.data.user?.displayName,
        emailAddress: about.data.user?.emailAddress,
      },
      storage: {
        limit: about.data.storageQuota?.limit,
        usage: about.data.storageQuota?.usage,
      },
      rootFolders: {
        count: folders.data.files?.length || 0,
        folders: folders.data.files?.map(f => ({ id: f.id, name: f.name })),
      },
      configuredFolder,
      scopes: 'Drive API access working',
    })
  } catch (error) {
    console.error('Drive test error:', error)
    return NextResponse.json(
      {
        error: 'Drive API test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
