import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sendPdfToWebhook } from '@/lib/webhook'
import { google } from 'googleapis'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'

/**
 * POST /api/documents/reprocess-webhook
 * Reprocess documents that failed webhook processing
 */
export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const { documentId } = await request.json()

    if (!documentId) {
      return NextResponse.json(
        { error: 'Document ID is required' },
        { status: 400 }
      )
    }

    // Fetch the document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .single()

    if (docError || !document) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      )
    }

    // Fetch user settings for webhook URL
    const { data: settings } = await supabase
      .from('user_settings')
      .select('webhook_url')
      .eq('user_id', user.id)
      .single()

    if (!settings?.webhook_url) {
      return NextResponse.json(
        { error: 'Webhook URL not configured' },
        { status: 400 }
      )
    }

    // Fetch the Gmail account for OAuth. Forwarded documents have no
    // gmail_account_id; fall back to the user's connected account, as
    // inbound-email does when storing them.
    let gmailAccountQuery = supabase
      .from('gmail_accounts')
      .select('*')
      .eq('user_id', user.id)
    if (document.gmail_account_id) {
      gmailAccountQuery = gmailAccountQuery.eq('id', document.gmail_account_id)
    }
    const { data: gmailAccount } = await gmailAccountQuery.limit(1).single()

    if (!gmailAccount) {
      return NextResponse.json(
        { error: 'Gmail account not found' },
        { status: 404 }
      )
    }

    // Download PDF from Google Drive
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    )

    // Stored tokens are encrypted, so they can't go to Google as-is. The helper
    // decrypts, refreshes if needed and persists the refreshed token encrypted;
    // the refresh token itself never needs to leave the server.
    oauth2Client.setCredentials({
      access_token: await getValidGmailAccessToken(supabase, gmailAccount),
    })

    const drive = google.drive({ version: 'v3', auth: oauth2Client })

    if (!document.drive_file_id) {
      return NextResponse.json(
        { error: 'Document does not have a Drive file ID' },
        { status: 400 }
      )
    }

    // Download the PDF
    const fileResponse = await drive.files.get(
      {
        fileId: document.drive_file_id,
        alt: 'media',
      },
      { responseType: 'arraybuffer' }
    )

    const pdfBuffer = Buffer.from(fileResponse.data as ArrayBuffer)

    // Send to webhook
    let webhookData = null
    let webhookError = null
    let classification: 'invoice' | 'credit_note' | 'unclassified' =
      'unclassified'

    try {
      const response = await sendPdfToWebhook(
        pdfBuffer,
        document.filename,
        settings.webhook_url
      )
      webhookData = response

      // Map webhook document_type to classification
      if (response.document_type === 'supplier_invoice') {
        classification = 'invoice'
      } else if (response.document_type === 'credit_note') {
        classification = 'credit_note'
      } else {
        classification = 'unclassified'
      }
    } catch (error) {
      // sendPdfToWebhook only produces its own messages (HTTP status, generic
      // network failure), never upstream body text. The length cap is a
      // backstop since this string is stored and returned to the client.
      webhookError =
        error instanceof Error
          ? error.message.slice(0, 200)
          : 'Unknown webhook error'
    }

    // Update the document with webhook data
    const { error: updateError } = await supabase
      .from('documents')
      .update({
        original_classification: classification,
        final_classification: classification,
        invoice_number: webhookData?.invoice_number || null,
        issue_date: webhookData?.issue_date || null,
        supplier_name: webhookData?.supplier_name || null,
        supplier_vat_number: webhookData?.supplier_vat_number || null,
        total_without_vat: webhookData?.total_without_vat
          ? parseFloat(webhookData.total_without_vat)
          : null,
        total_vat: webhookData?.total_vat
          ? parseFloat(webhookData.total_vat)
          : null,
        invoice_total: webhookData?.invoice_total
          ? parseFloat(webhookData.invoice_total)
          : null,
        currency: webhookData?.currency || null,
        numb_pages: webhookData?.numb_pages || null,
        document_type: webhookData?.document_type || null,
        webhook_processed_at: webhookData ? new Date().toISOString() : null,
        webhook_error: webhookError,
      })
      .eq('id', documentId)
      .eq('user_id', user.id)

    if (updateError) {
      console.error('[Reprocess] Update failed:', updateError)
      return NextResponse.json(
        { error: 'Failed to update document' },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      classification,
      webhookData,
      webhookError,
    })
  } catch (error) {
    console.error('Reprocess webhook error:', error)
    return NextResponse.json(
      {
        error: 'Failed to reprocess document',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
