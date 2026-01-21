import { google } from 'googleapis'
import crypto from 'crypto'
import { INVOICE_KEYWORDS, CREDIT_NOTE_KEYWORDS } from './constants'

export interface EmailAttachment {
  messageId: string
  filename: string
  mimeType: string
  data: Buffer
  sender: string
  senderDomain: string
  subject: string
  receivedDate: Date
}

export async function getGmailClient(accessToken: string) {
  const auth = new google.auth.OAuth2()
  auth.setCredentials({ access_token: accessToken })

  return google.gmail({ version: 'v1', auth })
}

export function calculateFileHash(data: Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex')
}

export function extractDomain(email: string): string {
  const match = email.match(/@(.+)$/)
  return match ? match[1].toLowerCase() : ''
}

export function hasInvoiceKeywords(text: string): boolean {
  const lowerText = text.toLowerCase()
  return (
    INVOICE_KEYWORDS.some(keyword => lowerText.includes(keyword)) ||
    CREDIT_NOTE_KEYWORDS.some(keyword => lowerText.includes(keyword))
  )
}

export interface ScanDebugInfo {
  query: string
  daysBack: number
  afterDate: string
  messagesFound: number
  messagesWithoutDateFilter: number
  pdfAttachmentsFound: number
}

export async function scanGmailForInvoices(
  accessToken: string,
  daysBack: number = 1
): Promise<{ attachments: EmailAttachment[]; debug: ScanDebugInfo }> {
  const gmail = await getGmailClient(accessToken)
  const attachments: EmailAttachment[] = []

  // Calculate date for search
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - daysBack)
  const afterDate = Math.floor(sinceDate.getTime() / 1000)

  // Search for ALL emails with attachments (we'll filter PDFs later)
  const query = `has:attachment after:${afterDate}`

  const debugInfo: ScanDebugInfo = {
    query,
    daysBack,
    afterDate: new Date(afterDate * 1000).toISOString(),
    messagesFound: 0,
    messagesWithoutDateFilter: 0,
    pdfAttachmentsFound: 0,
  }

  try {
    const response = await gmail.users.messages.list({
      userId: 'me',
      q: query,
      maxResults: 100,
    })

    const messages = response.data.messages || []
    debugInfo.messagesFound = messages.length

    if (messages.length === 0) {
      // Try without date filter as fallback
      const testResponse = await gmail.users.messages.list({
        userId: 'me',
        q: 'has:attachment',
        maxResults: 10,
      })

      debugInfo.messagesWithoutDateFilter = testResponse.data.messages?.length || 0

      if (testResponse.data.messages && testResponse.data.messages.length > 0) {
        messages.push(...testResponse.data.messages)
      }
    }

    for (const message of messages) {
      if (!message.id) continue

      try {
        const fullMessage = await gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'full',
        })

        const headers = fullMessage.data.payload?.headers || []
        const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || ''
        const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || ''
        const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value || ''

        // Extract sender email
        const senderMatch = from.match(/<(.+)>/) || from.match(/^(.+)$/)
        const senderEmail = senderMatch ? senderMatch[1].trim() : from
        const senderDomain = extractDomain(senderEmail)

        // Filter by invoice keywords
        if (!hasInvoiceKeywords(subject) && !hasInvoiceKeywords(from)) {
          continue
        }

        // Parse date
        const receivedDate = dateHeader ? new Date(dateHeader) : new Date()

        // Extract PDF attachments
        const parts = fullMessage.data.payload?.parts || []
        await extractAttachments(
          gmail,
          message.id,
          parts,
          attachments,
          subject,
          senderEmail,
          senderDomain,
          receivedDate
        )
      } catch (error) {
        console.error(`Error processing message ${message.id}:`, error)
      }
    }
  } catch (error) {
    console.error('Error scanning Gmail:', error)
    throw new Error('Failed to scan Gmail for invoices')
  }

  debugInfo.pdfAttachmentsFound = attachments.length

  return { attachments, debug: debugInfo }
}

async function extractAttachments(
  gmail: any,
  messageId: string,
  parts: any[],
  attachments: EmailAttachment[],
  subject: string,
  sender: string,
  senderDomain: string,
  receivedDate: Date
) {
  for (const part of parts) {
    if (part.filename && part.filename.toLowerCase().endsWith('.pdf')) {
      if (part.body?.attachmentId) {
        try {
          const attachment = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: messageId,
            id: part.body.attachmentId,
          })

          if (attachment.data.data) {
            const data = Buffer.from(attachment.data.data, 'base64')

            attachments.push({
              messageId,
              filename: part.filename,
              mimeType: part.mimeType || 'application/pdf',
              data,
              sender,
              senderDomain,
              subject,
              receivedDate,
            })
          }
        } catch (error) {
          console.error(`Error downloading attachment ${part.body.attachmentId}:`, error)
        }
      }
    }

    // Recursively check nested parts
    if (part.parts) {
      await extractAttachments(
        gmail,
        messageId,
        part.parts,
        attachments,
        subject,
        sender,
        senderDomain,
        receivedDate
      )
    }
  }
}
