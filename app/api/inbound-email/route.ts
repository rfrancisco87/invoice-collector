import { NextResponse } from 'next/server'
// import { createClient } from '@/lib/supabase/server' // Don't use SSR client for webhooks
import { createClient } from '@supabase/supabase-js'
import { ingestDocument } from '@/lib/ingestion'
import { getValidAccessToken } from '@/lib/token-refresh'
import { readSvixHeaders, verifySvixSignature } from '@/lib/webhook-signature'
import { resolveSiblingsForMessage } from '@/lib/classifier/resolve-siblings'
import type { PairPreference } from '@/lib/classifier/pairing'
import { randomUUID } from 'crypto'

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
        // Read the body as text: the signature is computed over the exact bytes
        // Resend sent, so re-serialising a parsed object would break the HMAC.
        const rawBody = await request.text()

        // This route is exempt from the middleware session check, which means
        // the signature IS the authentication. Fail closed if the secret is
        // missing — an unverified request here can write into any user's
        // account, so "no secret configured" must never mean "allow".
        const signature = verifySvixSignature(
            rawBody,
            readSvixHeaders(request.headers),
            process.env.RESEND_WEBHOOK_SECRET,
        )

        if (!signature.valid) {
            console.warn(`[Inbound Email] Rejected unsigned request: ${signature.reason}`)
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
        }

        let payload: ResendPayload
        try {
            payload = JSON.parse(rawBody) as ResendPayload
        } catch {
            return NextResponse.json({ error: 'Malformed JSON body' }, { status: 400 })
        }

        // Validate payload
        if (!payload.to || !payload.to.length) {
            return NextResponse.json({ error: 'Missing recipients' }, { status: 400 })
        }

        // Service-role client. This previously used NEXT_PUBLIC_SUPABASE_ANON_KEY
        // (mislabelled as containing the service role), so every lookup below was
        // blocked by RLS and the route always 404'd — inbound forwarding never
        // actually worked.
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
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

        // One id for the whole forwarded email, not one per attachment. When a
        // sender (Stripe, typically) attaches both an invoice and a receipt,
        // sharing the id is what lets the two rows be recognised as siblings.
        // The Svix message id is stable across Resend retries, so a redelivery
        // reuses it and the (user_id, email_message_id, file_hash) constraint
        // dedupes instead of creating a second copy.
        const emailMessageId = `inbound_${readSvixHeaders(request.headers).id ?? `${receivedDate.getTime()}_${randomUUID()}`}`

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
                        emailMessageId,
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

        // Invoice/receipt pairing, once every attachment of this email is stored.
        // Forwarding is the route Stripe mail typically takes, so this is the
        // path where pairs actually show up. Only multi-attachment mail can pair.
        let pairing = null
        if (results.length > 1) {
            try {
                pairing = await resolveSiblingsForMessage({
                    supabase,
                    userId: settings.user_id,
                    emailMessageId,
                    preference: (settings.duplicate_pair_default ?? 'invoice') as PairPreference,
                    providerToken,
                })
            } catch (error) {
                // The documents are already saved; a pairing failure must not
                // turn a successful ingest into an error response, which would
                // make Resend retry and duplicate the work.
                console.error('[Inbound Email] Pair detection failed:', error)
            }
        }

        return NextResponse.json({
            success: true,
            processed: results.length,
            details: results,
            pairing,
        })

    } catch (error) {
        console.error('Inbound webhook error:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
