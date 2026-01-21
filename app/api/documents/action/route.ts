import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google-drive'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { documentId, action } = body

    if (!documentId || !action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Get document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Get Gmail account for Drive access
    const { data: gmailAccount } = await supabase
      .from('gmail_accounts')
      .select('access_token')
      .eq('user_id', user.id)
      .single()

    if (!gmailAccount) {
      return NextResponse.json({ error: 'Gmail account not found' }, { status: 404 })
    }

    // Get user settings for Drive folder
    const { data: settings } = await supabase
      .from('user_settings')
      .select('drive_folder_id')
      .eq('user_id', user.id)
      .single()

    if (!settings?.drive_folder_id) {
      return NextResponse.json({ error: 'Drive folder not configured' }, { status: 400 })
    }

    const drive = await getDriveClient(gmailAccount.access_token)

    if (action === 'approve') {
      // Move to Approved/MM-YYYY folder
      const date = new Date(document.received_date)
      const monthYear = `${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`
      const approvedFolderName = `Approved/${monthYear}`

      // Find or create Approved folder
      let approvedParentResponse = await drive.files.list({
        q: `name='Approved' and '${settings.drive_folder_id}' in parents and trashed=false`,
        fields: 'files(id)',
      })

      let approvedParentId = approvedParentResponse.data.files?.[0]?.id

      if (!approvedParentId) {
        const createApproved = await drive.files.create({
          requestBody: {
            name: 'Approved',
            mimeType: 'application/vnd.google-apps.folder',
            parents: [settings.drive_folder_id],
          },
          fields: 'id',
        })
        approvedParentId = createApproved.data.id!
      }

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

      // Move file
      await drive.files.update({
        fileId: document.drive_file_id,
        addParents: monthFolderId,
        removeParents: 'root',
        fields: 'id, parents',
      })

      // Update document status
      await supabase
        .from('documents')
        .update({
          status: 'approved',
          approved_at: new Date().toISOString(),
          drive_folder_path: approvedFolderName,
        })
        .eq('id', documentId)

      // Record feedback
      await supabase.from('user_feedback').insert({
        user_id: user.id,
        document_id: documentId,
        action: 'approved',
        original_classification: document.original_classification,
        new_classification: document.final_classification,
        sender_domain: document.sender_domain,
      })
    } else {
      // Reject - delete from Drive and mark as rejected
      await drive.files.delete({
        fileId: document.drive_file_id,
      })

      // Update document status
      await supabase
        .from('documents')
        .update({
          status: 'rejected',
          rejected_at: new Date().toISOString(),
        })
        .eq('id', documentId)

      // Record feedback
      await supabase.from('user_feedback').insert({
        user_id: user.id,
        document_id: documentId,
        action: 'rejected',
        original_classification: document.original_classification,
        new_classification: document.final_classification,
        sender_domain: document.sender_domain,
      })
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
