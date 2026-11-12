import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getDriveClient } from '@/lib/google-drive'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'
import { trashInboxFile } from '@/lib/drive-inbox'
import {
  DEFAULT_APPROVED_FILENAME_TEMPLATE,
  renderApprovedFilename,
} from '@/lib/filename-template'
import {
  findOrCreateChildFolder,
  moveFileToFolder,
  resolveApprovedMonthFolder,
} from '@/lib/drive-folders'
import { sendApprovedDocumentEmail } from '@/lib/email'
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
      .select('id, user_id, access_token, refresh_token, token_expiry')
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

    // Stored tokens are encrypted; this decrypts and refreshes if needed.
    const drive = await getDriveClient(await getValidGmailAccessToken(supabase, gmailAccount))

    if (action === 'approve') {
      // @ts-ignore
      const deliverByEmail = settings.approved_delivery_mode === 'email'
      // @ts-ignore
      const deliveryEmail: string | null = settings.approved_delivery_email || null

      if (deliverByEmail && !deliveryEmail) {
        return NextResponse.json(
          { error: 'Configure o email de destino dos documentos aprovados nas definições.' },
          { status: 400 }
        )
      }

      // Rename with the user's template; applies to the Drive file or to the
      // email attachment, depending on the delivery mode.
      let finalFilename: string | null = null
      // @ts-ignore
      if (document.drive_file_id) {
        // @ts-ignore
        const template = settings.approved_filename_template || DEFAULT_APPROVED_FILENAME_TEMPLATE
        const renamed = renderApprovedFilename(
          template,
          // @ts-ignore - document is the row we just fetched
          document,
          // @ts-ignore
          document.filename,
        )
        // @ts-ignore
        if (renamed && renamed !== document.filename) {
          finalFilename = renamed
        }
      }

      const documentUpdate: any = {
        status: 'approved' as const,
        approved_at: new Date().toISOString(),
      }
      if (finalFilename) {
        documentUpdate.filename = finalFilename
      }

      // Already delivered to this address (e.g. a previous approve sent the
      // email but failed on the Drive move): don't send it twice.
      // @ts-ignore
      const alreadyEmailed = !!document.emailed_at && document.emailed_to === deliveryEmail

      if (deliverByEmail && !alreadyEmailed) {
        // @ts-ignore
        if (!document.drive_file_id) {
          return NextResponse.json(
            { error: 'O ficheiro deste documento não existe no Drive e não pode ser enviado.' },
            { status: 409 }
          )
        }

        // Send first: if delivery fails the document stays pending and the
        // file stays in Pending Approval, so the user can simply retry.
        const response = await drive.files.get(
          // @ts-ignore
          { fileId: document.drive_file_id, alt: 'media' },
          { responseType: 'arraybuffer' },
        )
        const content = Buffer.from(response.data as ArrayBuffer)

        try {
          await sendApprovedDocumentEmail(
            deliveryEmail!,
            {
              // @ts-ignore
              filename: finalFilename || document.filename,
              content,
              // @ts-ignore
              supplierName: document.supplier_name,
              // @ts-ignore
              invoiceNumber: document.invoice_number,
              // @ts-ignore
              receivedDate: document.received_date,
            },
            // @ts-ignore
            settings.notification_email || user.email,
          )
        } catch (sendError) {
          console.error('[Action] Email delivery failed:', sendError)
          return NextResponse.json(
            { error: 'Falha ao enviar o documento por email. Tente novamente.' },
            { status: 502 }
          )
        }

        // Record delivery straight away, before the Drive move, so a retry
        // after a Drive failure does not email the accountant again.
        const emailedFields = { emailed_to: deliveryEmail, emailed_at: new Date().toISOString() }
        await supabase
          .from('documents')
          // @ts-ignore - Supabase row types infer as never across this project
          .update(emailedFields)
          .eq('id', documentId)
          .eq('user_id', user.id)
        Object.assign(documentUpdate, emailedFields)
      }

      // Both modes file the document in Approved/MM-YYYY, so the user keeps a
      // copy in Drive even when it was also emailed to the accounting inbox.
      // @ts-ignore
      const approved = await resolveApprovedMonthFolder(drive, settings, document.received_date)

      // Move the file out of whatever folder it is in (Pending Approval, or the
      // inbox folder's pending location) and rename it in the same Drive call.
      // @ts-ignore
      if (document.drive_file_id) {
        await moveFileToFolder(
          drive,
          // @ts-ignore
          document.drive_file_id,
          approved.folderId,
          finalFilename ? { name: finalFilename } : undefined,
        )
      }

      documentUpdate.drive_folder_path = approved.path
      // @ts-ignore
      await supabase
        .from('documents')
        // @ts-ignore
        .update(documentUpdate)
        .eq('id', documentId)
        .eq('user_id', user.id)

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
      // Reject - move to Drive trash (not a hard delete) so the rejection can
      // be reverted from the Rejected page. Drive purges trash after 30 days.
      // @ts-ignore
      if (document.drive_file_id) {
        // A trashed file keeps its parent, so an approved file trashed in place
        // would still be listed under Approved/MM-YYYY by anything that doesn't
        // filter out trashed files (Drive sync, accounting integrations). Move
        // it back to Pending Approval first: same state as a normal rejection.
        // Restore moves it back to the approved folder.
        // @ts-ignore
        if (document.status === 'approved') {
          // @ts-ignore
          const pendingId = await findOrCreateChildFolder(drive, 'Pending Approval', settings.drive_folder_id)
          // @ts-ignore
          await moveFileToFolder(drive, document.drive_file_id, pendingId)
        }

        // @ts-ignore
        await drive.files.update({
          // @ts-ignore
          fileId: document.drive_file_id,
          requestBody: { trashed: true },
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
        .eq('user_id', user.id)

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
        // @ts-ignore
        await trashInboxFile(drive, document.inbox_file_id)
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
