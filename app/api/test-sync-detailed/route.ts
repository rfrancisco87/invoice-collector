import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { scanGmailForInvoices } from '@/lib/gmail'

export async function POST(request: Request) {
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

    // Get settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', session.user.id)
      .single()

    if (!settings) {
      return NextResponse.json({ error: 'No settings found' }, { status: 404 })
    }

    // Scan Gmail
    console.log('Starting detailed Gmail scan test...')
    const { attachments, debug } = await scanGmailForInvoices(
      providerToken,
      settings.sync_days_back
    )

    // Detailed attachment analysis
    const attachmentDetails = attachments.map((att, idx) => ({
      index: idx + 1,
      filename: att.filename,
      sender: att.sender,
      subject: att.subject,
      messageId: att.messageId,
      mimeType: att.mimeType,
      dataType: typeof att.data,
      dataIsBuffer: Buffer.isBuffer(att.data),
      dataLength: att.data?.length || 0,
      receivedDate: att.receivedDate.toISOString(),
      senderDomain: att.senderDomain,
    }))

    return NextResponse.json({
      success: true,
      debug,
      attachmentsCount: attachments.length,
      attachmentDetails,
      rawAttachmentsSample: attachments.length > 0 ? {
        firstAttachment: {
          hasData: !!attachments[0].data,
          dataConstructor: attachments[0].data?.constructor?.name,
          firstBytes: attachments[0].data ? Array.from(attachments[0].data.slice(0, 10)) : [],
        }
      } : null,
    })
  } catch (error) {
    console.error('Detailed sync test error:', error)
    return NextResponse.json(
      {
        error: 'Sync test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined,
      },
      { status: 500 }
    )
  }
}
