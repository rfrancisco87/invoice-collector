import type { gmail_v1 } from 'googleapis'

/**
 * Sending mail through the user's own Gmail account (gmail.modify scope).
 *
 * Used to deliver approved documents to accounting inboxes such as TOCOnline,
 * which only accept documents from addresses the user registered there. Mail
 * sent this way carries the user's own domain authentication (SPF/DKIM) and
 * shows up in their Sent folder.
 */

export interface SendAsAddress {
  email: string
  displayName: string | null
  isPrimary: boolean
}

/**
 * Addresses the connected account may send as: the primary address plus any
 * verified "Send mail as" aliases. Gmail silently rewrites the From header to
 * the primary address for anything not in this list, so callers must only
 * ever send from one of these.
 */
export async function listSendAsAddresses(gmail: gmail_v1.Gmail): Promise<SendAsAddress[]> {
  const { data } = await gmail.users.settings.sendAs.list({ userId: 'me' })
  return (data.sendAs ?? [])
    .filter((alias) => alias.sendAsEmail && (alias.isPrimary || alias.verificationStatus === 'accepted'))
    .map((alias) => ({
      email: alias.sendAsEmail!.toLowerCase(),
      displayName: alias.displayName || null,
      isPrimary: !!alias.isPrimary,
    }))
}

export interface GmailMessage {
  from: SendAsAddress
  to: string
  replyTo?: string | null
  subject: string
  html: string
  attachment: { filename: string; content: Buffer; contentType?: string }
}

/** RFC 2047 encoded-word, so Portuguese characters survive in headers. */
function encodeHeader(value: string): string {
  // Strip CR/LF: these values include attacker-controlled names.
  const clean = value.replace(/[\r\n]+/g, ' ')
  return /^[\x20-\x7e]*$/.test(clean)
    ? clean
    : `=?UTF-8?B?${Buffer.from(clean, 'utf8').toString('base64')}?=`
}

function wrapBase64(buffer: Buffer): string {
  return buffer.toString('base64').replace(/.{1,76}/g, '$&\r\n')
}

function assertAddress(value: string): string {
  if (/[\r\n<>,;"]/.test(value) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
    throw new Error(`Invalid email address: ${value}`)
  }
  return value
}

export function buildMimeMessage(message: GmailMessage): string {
  const boundary = `ic_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`
  const fromAddress = assertAddress(message.from.email)
  const from = message.from.displayName
    ? `${encodeHeader(message.from.displayName.replace(/"/g, ''))} <${fromAddress}>`
    : fromAddress

  const filename = message.attachment.filename.replace(/[\r\n"\\]/g, '_')
  const asciiFilename = filename.replace(/[^\x20-\x7e]/g, '_')
  const encodedFilename = encodeURIComponent(filename)
  const contentType = message.attachment.contentType || 'application/pdf'

  const headers = [
    `From: ${from}`,
    `To: ${assertAddress(message.to)}`,
    ...(message.replyTo ? [`Reply-To: ${assertAddress(message.replyTo)}`] : []),
    `Subject: ${encodeHeader(message.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
  ]

  return [
    ...headers,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(Buffer.from(message.html, 'utf8')),
    `--${boundary}`,
    `Content-Type: ${contentType}; name="${asciiFilename}"`,
    `Content-Disposition: attachment; filename="${asciiFilename}"; filename*=UTF-8''${encodedFilename}`,
    'Content-Transfer-Encoding: base64',
    '',
    wrapBase64(message.attachment.content),
    `--${boundary}--`,
    '',
  ].join('\r\n')
}

export async function sendGmailMessage(gmail: gmail_v1.Gmail, message: GmailMessage) {
  const raw = Buffer.from(buildMimeMessage(message), 'utf8').toString('base64url')
  const { data } = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  return { messageId: data.id ?? null }
}
