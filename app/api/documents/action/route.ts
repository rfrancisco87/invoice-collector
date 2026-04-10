import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google-drive'
import { Database } from '@/types/database'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const body = await request.json()
    const { documentId, action } = body

    if (!documentId || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Get document
    // @ts-ignore - TypeScript has issues with Supabase types
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Get Gmail account for Drive access
    // @ts-ignore - TypeScript has issues with Supabase types
    const { data: gmailAccount, error: gmailError } = await supabase
      .from('gmail_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .maybeSingle()

    if (gmailError || !gmailAccount) {
      return NextResponse.json({ error: 'Gmail account not found' }, { status: 404 })
    }

    // Get user settings for Drive folder
    const settingsResult = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle()

    // @ts-ignore - TypeScript has issues with Supabase types
    const settings = settingsResult.data
    const settingsError = settingsResult.error

    // @ts-ignore
    if (settingsError || !settings?.drive_folder_id) {
      return NextResponse.json({ error: 'Drive folder not configured' }, { status: 400 })
    }

    // @ts-ignore
    const drive = await getDriveClient(gmailAccount.access_token)

    if (action === 'approve') {
      // Move to Approved/MM-YYYY folder
      // @ts-ignore
      const date = new Date(document.received_date)
      const monthYear = `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`

      // Resolve the parent of the MM-YYYY subfolder.
      // If the user picked an existing approved folder, place MM-YYYY inside it.
      // Otherwise create/reuse an "Approved" folder under their main Drive folder.
      let approvedParentId: string
      let approvedParentName: string

      // @ts-ignore
      if (settings.approved_folder_mode === 'existing' && settings.approved_folder_id) {
        // @ts-ignore
        approvedParentId = settings.approved_folder_id
        // @ts-ignore
        approvedParentName = settings.approved_folder_name || 'Approved'
      } else {
        // @ts-ignore
        const approvedParentResponse = await drive.files.list({
          // @ts-ignore
          q: `name='Approved' and '${settings.drive_folder_id}' in parents and trashed=false`,
          fields: 'files(id)',
        })

        let resolvedId = approvedParentResponse.data.files?.[0]?.id
        if (!resolvedId) {
          // @ts-ignore
          const createApproved = await drive.files.create({
            requestBody: {
              name: 'Approved',
              mimeType: 'application/vnd.google-apps.folder',
              // @ts-ignore
              parents: [settings.drive_folder_id],
            },
            fields: 'id',
          })
          resolvedId = createApproved.data.id!
        }
        approvedParentId = resolvedId
        approvedParentName = 'Approved'
      }

      const approvedFolderName = `${approvedParentName}/${monthYear}`

      // Find or create month folder
      let monthFolderResponse = await drive.files.list({
        q: `name='${monthYear}' and '${approvedParentId}' in parents and trashed=false`,
        fields: 'files(id)',
      })

      let monthFolderId = monthFolderResponse.data.files?.[0]?.id

      if (!monthFolderId) {
        const createMonth = await drive.files.create({
          requestBody: {
            name: monthYear,
            mimeType: 'application/vnd.google-apps.folder',
            parents: [approvedParentId],
          },
          fields: 'id',
        })
        monthFolderId = createMonth.data.id!
      }

      // Move file: resolve the file's actual current parents and remove them.
      // The previous implementation hardcoded `removeParents: 'root'`, which is
      // wrong for files synced from the inbox folder (their parent is the
      // "Pending Approval" folder, not 'root'). On Workspace accounts that
      // permitted multi-parent files, this left the file in two places.
      // @ts-ignore
      if (document.drive_file_id) {
        // @ts-ignore
        const fileMeta = await drive.files.get({
          // @ts-ignore
          fileId: document.drive_file_id,
          fields: 'parents',
        })
        const currentParents = (fileMeta.data.parents || []).join(',')

        // @ts-ignore
        await drive.files.update({
          // @ts-ignore
          fileId: document.drive_file_id,
          addParents: monthFolderId,
          removeParents: currentParents,
          fields: 'id, parents',
        })
      }

      // Update document status
      // @ts-ignore
      await supabase
        .from('documents')
        // @ts-ignore
        .update({
          status: 'approved' as const,
          approved_at: new Date().toISOString(),
          drive_folder_path: approvedFolderName,
        })
        .eq('id', documentId)

      // Record feedback
      // @ts-ignore
      await supabase.from('user_feedback').insert({
        user_id: user.id,
        document_id: documentId,
        action: 'approved' as const,
        // @ts-ignore
        original_classification: document.original_classification,
        // @ts-ignore
        new_classification: document.final_classification,
        // @ts-ignore
        sender_domain: document.sender_domain,
      })
    } else {
      // Reject - delete from Drive and mark as rejected
      // @ts-ignore
      if (document.drive_file_id) {
        // @ts-ignore
        await drive.files.delete({
          // @ts-ignore
          fileId: document.drive_file_id,
        })
      }

      // Update document status
      // @ts-ignore
      await supabase
        .from('documents')
        // @ts-ignore
        .update({
          status: 'rejected' as const,
          rejected_at: new Date().toISOString(),
        })
        .eq('id', documentId)

      // Record feedback
      // @ts-ignore
      await supabase.from('user_feedback').insert({
        user_id: user.id,
        document_id: documentId,
        action: 'rejected' as const,
        // @ts-ignore
        original_classification: document.original_classification,
        // @ts-ignore
        new_classification: document.final_classification,
        // @ts-ignore
        sender_domain: document.sender_domain,
      })
    }

    // Cleanup: If the document came from the inbox folder, remove the original file.
    // We always attempt this when inbox_file_id is set — the previous guard on
    // settings.inbox_folder_id silently skipped cleanup if the user later disabled
    // or unlinked the inbox folder, leaving orphaned files behind.
    // @ts-ignore
    if (document.source === 'inbox_folder' && document.inbox_file_id) {
      try {
        // @ts-ignore
        await drive.files.delete({
          // @ts-ignore
          fileId: document.inbox_file_id,
        })
        // @ts-ignore
        console.log(`[Action] Cleaned up original inbox file ${document.inbox_file_id}`)
      } catch (cleanupError: any) {
        // 404 means the file was already removed (e.g. by sync). Anything else is
        // a real failure we want visible in logs so we can diagnose permission /
        // scope issues — don't fail the request since the document is approved.
        const status = cleanupError?.code ?? cleanupError?.response?.status
        if (status === 404) {
          // @ts-ignore
          console.log(`[Action] Inbox file ${document.inbox_file_id} already gone (404)`)
        } else {
          console.error('[Action] Failed to clean up inbox file:', cleanupError)
        }
      }
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Document action error:', error)
    return NextResponse.json(
      { error: 'Failed to process document action' },
      { status: 500 }
    )
  }
}
