import { google } from 'googleapis'
import crypto from 'crypto'

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

/**
 * Get or create a Gmail label
 * @param gmail - Gmail API client
 * @param labelName - Name of the label to create/get
 * @returns Label ID
 */
export async function getOrCreateLabel(
  gmail: any,
  labelName: string
): Promise<string> {
  try {
    console.log(`[getOrCreateLabel] Listing existing labels to find "${labelName}"`)
    // List existing labels
    const labelsResponse = await gmail.users.labels.list({
      userId: 'me',
    })

    const labels = labelsResponse.data.labels || []
    console.log(`[getOrCreateLabel] Found ${labels.length} total labels`)
    const existingLabel = labels.find((label: any) => label.name === labelName)

    if (existingLabel) {
      console.log(`[getOrCreateLabel] Found existing label: ${existingLabel.name} (ID: ${existingLabel.id})`)
      return existingLabel.id
    }

    // Create new label if it doesn't exist
    console.log(`[getOrCreateLabel] Label "${labelName}" not found, creating new label`)
    const createResponse = await gmail.users.labels.create({
      userId: 'me',
      requestBody: {
        name: labelName,
        labelListVisibility: 'labelShow',
        messageListVisibility: 'show',
      },
    })

    console.log(`[getOrCreateLabel] Created new label: ${labelName} (ID: ${createResponse.data.id})`)
    return createResponse.data.id
  } catch (error) {
    console.error('[getOrCreateLabel] Error getting/creating label:', error)
    throw new Error('Failed to get or create Gmail label')
  }
}

/**
 * Apply a label to a Gmail message
 * @param gmail - Gmail API client
 * @param messageId - Gmail message ID
 * @param labelId - Label ID to apply
 */
export async function applyLabelToMessage(
  gmail: any,
  messageId: string,
  labelId: string
): Promise<void> {
  try {
    console.log(`[applyLabelToMessage] Modifying message ${messageId} with label ${labelId}`)
    const result = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        addLabelIds: [labelId],
      },
    })
    console.log(`[applyLabelToMessage] Successfully modified message, result:`, result.data)
  } catch (error) {
    console.error(`[applyLabelToMessage] Error applying label ${labelId} to message ${messageId}:`, error)
    // Re-throw so the caller can log the error
    throw error
  }
}

/**
 * Archive a Gmail message (remove from inbox)
 * @param gmail - Gmail API client
 * @param messageId - Gmail message ID
 */
export async function archiveMessage(
  gmail: any,
  messageId: string
): Promise<void> {
  try {
    console.log(`[archiveMessage] Archiving message ${messageId}`)
    const result = await gmail.users.messages.modify({
      userId: 'me',
      id: messageId,
      requestBody: {
        removeLabelIds: ['INBOX'],
      },
    })
    console.log(`[archiveMessage] Successfully archived message, result:`, result.data)
  } catch (error) {
    console.error(`[archiveMessage] Error archiving message ${messageId}:`, error)
    throw error
  }
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

  // Guard against null/undefined/0 — ensure at least 1 day
  const safeDaysBack = Math.max(1, Number(daysBack) || 1)

  // Calculate the search boundary as the START of the day (midnight UTC),
  // with an extra day buffer to cover timezone differences between the
  // server and Gmail. Duplicate detection (file hash) prevents reprocessing.
  const sinceDate = new Date()
  sinceDate.setDate(sinceDate.getDate() - safeDaysBack - 1)
  sinceDate.setUTCHours(0, 0, 0, 0)

  // Use YYYY/MM/DD format for the Gmail `after:` operator — this is the
  // documented format and avoids the ambiguous day-rounding behaviour that
  // epoch-second values can trigger.
  const afterDateStr = `${sinceDate.getUTCFullYear()}/${String(sinceDate.getUTCMonth() + 1).padStart(2, '0')}/${String(sinceDate.getUTCDate()).padStart(2, '0')}`

  // Search for ALL emails with attachments (we'll filter PDFs later)
  const query = `has:attachment after:${afterDateStr}`

  const debugInfo: ScanDebugInfo = {
    query,
    daysBack: safeDaysBack,
    afterDate: sinceDate.toISOString(),
    messagesFound: 0,
    messagesWithoutDateFilter: 0,
    pdfAttachmentsFound: 0,
  }

  try {
    // Paginate through all matching messages (Gmail returns max 500 per page)
    const messages: Array<{ id?: string | null; threadId?: string | null }> = []
    let pageToken: string | undefined = undefined

    do {
      const response: any = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: 500,
        pageToken,
      })

      const pageMessages = response.data.messages || []
      messages.push(...pageMessages)
      pageToken = response.data.nextPageToken || undefined
    } while (pageToken)

    debugInfo.messagesFound = messages.length

    if (messages.length === 0) {
      // Try without date filter as fallback to check connectivity
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
        attachments.push(...(await fetchMessageAttachments(gmail, message.id)))
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

/**
 * Download every PDF attachment of one Gmail message, with the sender/subject
 * metadata ingestion needs. Used by the sync scan and by restore, which
 * re-fetches an auto-rejected attachment straight from the mailbox instead of
 * waiting for a sync whose lookback window may no longer reach the email.
 */
export async function fetchMessageAttachments(
  gmail: any,
  messageId: string
): Promise<EmailAttachment[]> {
  const fullMessage = await gmail.users.messages.get({
    userId: 'me',
    id: messageId,
    format: 'full',
  })

  const headers: any[] = fullMessage.data.payload?.headers || []
  const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || ''
  const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || ''
  const dateHeader = headers.find(h => h.name?.toLowerCase() === 'date')?.value || ''

  // Extract sender email
  const senderMatch = from.match(/<(.+)>/) || from.match(/^(.+)$/)
  const senderEmail = senderMatch ? senderMatch[1].trim() : from
  const senderDomain = extractDomain(senderEmail)

  // Parse date
  const receivedDate = dateHeader ? new Date(dateHeader) : new Date()

  // Extract PDF attachments
  const attachments: EmailAttachment[] = []
  await extractAttachments(
    gmail,
    messageId,
    fullMessage.data.payload?.parts || [],
    attachments,
    subject,
    senderEmail,
    senderDomain,
    receivedDate
  )
  return attachments
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
