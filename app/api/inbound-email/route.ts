import { NextResponse } from 'next/server'
// import { createClient } from '@/lib/supabase/server' // Don't use SSR client for webhooks
import { createClient } from '@supabase/supabase-js'
import { ingestDocument } from '@/lib/ingestion'
import { getValidAccessToken } from '@/lib/token-refresh'

// Resend Payload Types
interface ResendAttachment {
    filename: string
    content: string // buffer digits or base64? Resend documentation usually says buffer
    type: string
    size: number
}

interface ResendPayload {
    from: string
    to: string[]
    subject: string
    html: string
    text: string
    attachments: ResendAttachment[]
}

export async function POST(request: Request) {
    try {
        const payload = await request.json() as ResendPayload

        // Validate payload
        if (!payload.to || !payload.to.length) {
            return NextResponse.json({ error: 'Missing recipients' }, { status: 400 })
        }

        // Initialize Supabase Client (Service Role)
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY! // Contains service_role
        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
            }
        })

        const recipient = payload.to.find(email => email.endsWith('entuaava.resend.app'))

        if (!recipient) {
            return NextResponse.json({ message: 'Ignored - not for this domain' }, { status: 200 })
        }

        // Removed profiles join as it might trigger RLS issues and we don't use the email
        const { data: settings } = await supabase
            .from('user_settings')
            .select('*')
            .eq('inbound_email', recipient)
            .single()

        if (!settings) {
            return NextResponse.json({ error: 'User not found for this email' }, { status: 404 })
        }

        const { data: gmailAccount } = await supabase
            .from('gmail_accounts')
            .select('*')
            .eq('user_id', settings.user_id)
            .limit(1)
            .single()

        if (!gmailAccount) {
            return NextResponse.json({ error: 'No connected storage account' }, { status: 400 })
        }

        // Get valid token
        let providerToken: string
        try {
            const tokenResult = await getValidAccessToken(
                gmailAccount.access_token,
                gmailAccount.refresh_token,
                gmailAccount.token_expiry
            )
            providerToken = tokenResult.accessToken

            if (tokenResult.needsUpdate && tokenResult.newExpiry) {
                await supabase
                    .from('gmail_accounts')
                    .update({
                        access_token: tokenResult.accessToken,
                        token_expiry: tokenResult.newExpiry,
                    })
                    .eq('id', gmailAccount.id)
            }

        } catch (e) {
            return NextResponse.json({ error: 'Failed to refresh token' }, { status: 401 })
        }

        const results = []
        const receivedDate = new Date()
        const sender = payload.from
        const senderDomain = sender.split('@')[1] || ''

        for (const att of payload.attachments || []) {
            if (att.content && (att.type === 'application/pdf' || att.filename.toLowerCase().endsWith('.pdf'))) {
                let buffer: Buffer
                if (Buffer.isBuffer(att.content)) {
                    buffer = att.content
                } else if (typeof att.content === 'object' && (att.content as any).data) {
                    buffer = Buffer.from((att.content as any).data)
                } else {
                    buffer = Buffer.from(att.content as any)
                }

                const result = await ingestDocument(
                    {
                        user: { id: settings.user_id },
                        settings: settings,
                        providerToken: providerToken
                    },
                    buffer,
                    att.filename,
                    {
                        emailMessageId: `inbound_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                        subject: payload.subject,
                        sender: sender,
                        senderDomain: senderDomain,
                        receivedDate: receivedDate,
                        source: 'forwarding'
                    }
                )
                results.push(result)
            }
        }

        return NextResponse.json({ success: true, processed: results.length, details: results })

    } catch (error) {
        console.error('Inbound webhook error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
