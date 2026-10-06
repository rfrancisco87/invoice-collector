/**
 * Webhook Client for n8n Invoice Processing
 *
 * Sends PDF files to external webhook for automated data extraction
 */

import http from 'node:http'
import https from 'node:https'
import { assertSafeOutboundUrl, safeLookup, UnsafeUrlError } from '@/lib/safe-url'

const WEBHOOK_TIMEOUT_MS = 30_000
// Extraction results are a handful of short fields; anything much larger is
// not a legitimate response and should not be buffered into memory.
const MAX_RESPONSE_BYTES = 1024 * 1024
// The parsed fields are stored on the document and echoed to the client, so
// cap them to keep a misbehaving endpoint from stuffing arbitrary data in.
const MAX_FIELD_LENGTH = 500

export interface WebhookResponse {
  invoice_number: string
  issue_date: string
  supplier_name: string
  supplier_vat_number: string
  total_without_vat: string
  total_vat: string
  invoice_total: string
  currency: string
  numb_pages: number
  document_type: string
}

class WebhookRequestError extends Error {}

/**
 * POST a body to an already-validated URL using node:http(s) rather than
 * fetch: fetch cannot pin the connect-time address, so a DNS rebind between
 * validation and connect would reach an internal host. safeLookup re-checks
 * the resolved IP on connect. Redirects are not followed (http.request never
 * does), so a 3xx cannot bounce the request to an internal address.
 */
function postToWebhook(
  url: URL,
  body: Buffer,
  contentType: string
): Promise<{ status: number; body: Buffer }> {
  const client = url.protocol === 'https:' ? https : http

  return new Promise((resolve, reject) => {
    const req = client.request(
      url,
      {
        method: 'POST',
        headers: { 'content-type': contentType, 'content-length': body.length },
        lookup: safeLookup,
        agent: false,
        timeout: WEBHOOK_TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (chunk: Buffer) => {
          size += chunk.length
          if (size > MAX_RESPONSE_BYTES) {
            req.destroy(new WebhookRequestError('Webhook response too large'))
            return
          }
          chunks.push(chunk)
        })
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks) }))
        res.on('error', reject)
      }
    )

    // Socket inactivity timeout plus an overall deadline, so a slow-drip
    // response cannot hold the request open indefinitely.
    const deadline = setTimeout(
      () => req.destroy(new WebhookRequestError('Webhook request timed out after 30 seconds')),
      WEBHOOK_TIMEOUT_MS
    )
    req.on('timeout', () =>
      req.destroy(new WebhookRequestError('Webhook request timed out after 30 seconds'))
    )
    req.on('error', reject)
    req.on('close', () => clearTimeout(deadline))
    req.end(body)
  })
}

function toField(value: unknown): string {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  return String(value).slice(0, MAX_FIELD_LENGTH)
}

/**
 * Send PDF to webhook for processing
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param filename - Original filename
 * @param webhookUrl - External webhook endpoint URL
 * @returns Parsed invoice data from webhook
 * @throws Error if webhook fails or returns invalid data. Messages are
 *   generated here (never upstream body/status text) because callers persist
 *   and return them to the client.
 */
export async function sendPdfToWebhook(
  pdfBuffer: Buffer,
  filename: string,
  webhookUrl: string
): Promise<WebhookResponse> {
  try {
    // Validate URL to prevent SSRF attacks (resolves DNS; rejects private IPs)
    const url = await assertSafeOutboundUrl(webhookUrl)

    // Let the platform serialise the multipart body, then send the bytes
    // through our own client.
    const formData = new FormData()
    const blob = new Blob([new Uint8Array(pdfBuffer)], { type: 'application/pdf' })
    formData.append('file', blob, filename)
    const encoded = new Request('http://localhost/', { method: 'POST', body: formData })
    const body = Buffer.from(await encoded.arrayBuffer())
    const contentType = encoded.headers.get('content-type') || 'multipart/form-data'

    const response = await postToWebhook(url, body, contentType)

    if (response.status >= 300 && response.status < 400) {
      throw new WebhookRequestError(`Webhook returned a redirect (HTTP ${response.status}); redirects are not followed`)
    }
    if (response.status < 200 || response.status >= 300) {
      throw new WebhookRequestError(`Webhook returned HTTP ${response.status}`)
    }

    // Parse JSON response - handle nested structure
    let rawResponse: any
    try {
      rawResponse = JSON.parse(response.body.toString('utf8'))
    } catch {
      throw new WebhookRequestError('Webhook returned invalid JSON')
    }

    // Extract data from nested path: [0].message.content
    // The webhook returns an array with structure: [{ message: { content: { ...invoice_data } } }]
    let data: any
    if (Array.isArray(rawResponse) && rawResponse[0]?.message?.content) {
      data = rawResponse[0].message.content
    } else if (rawResponse?.message?.content) {
      // Fallback for single object with nested structure
      data = rawResponse.message.content
    } else {
      // Fallback to flat structure for compatibility
      data = rawResponse
    }

    // Validate response has required fields
    if (!data || typeof data !== 'object') {
      throw new WebhookRequestError('Webhook returned invalid response format')
    }

    // Return parsed data (all fields optional, webhook may return empty strings)
    const pages = Number(data.numb_pages)
    return {
      invoice_number: toField(data.invoice_number),
      issue_date: toField(data.issue_date),
      supplier_name: toField(data.supplier_name),
      supplier_vat_number: toField(data.supplier_vat_number),
      total_without_vat: toField(data.total_without_vat),
      total_vat: toField(data.total_vat),
      invoice_total: toField(data.invoice_total),
      currency: toField(data.currency),
      numb_pages: Number.isFinite(pages) && pages > 0 ? Math.floor(pages) : 0,
      document_type: toField(data.document_type),
    }
  } catch (error) {
    if (error instanceof UnsafeUrlError || error instanceof WebhookRequestError) {
      throw new Error(`Webhook processing failed: ${error.message}`)
    }
    // Network-level errors: report only the error code. Raw messages include
    // resolved IPs/ports, which would turn this into a network probe.
    const code = (error as NodeJS.ErrnoException)?.code
    if (code === 'EUNSAFEADDR') {
      throw new Error('Webhook processing failed: Webhook URL must point to a public address')
    }
    throw new Error(`Webhook processing failed: could not reach webhook${code ? ` (${code})` : ''}`)
  }
}

/**
 * Test webhook connectivity with a dummy request
 *
 * @param webhookUrl - Webhook endpoint to test
 * @returns Success message if webhook is reachable
 * @throws Error if webhook test fails
 */
export async function testWebhookConnection(
  webhookUrl: string
): Promise<{ success: boolean; message: string }> {
  try {
    // Create a minimal test PDF (1x1 blank PDF)
    const testPdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Count 1/Kids[3 0 R]>>endobj 3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R/Resources<<>>>>endobj\nxref\n0 4\n0000000000 65535 f\n0000000009 00000 n\n0000000056 00000 n\n0000000115 00000 n\ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n210\n%%EOF',
      'binary'
    )

    const response = await sendPdfToWebhook(
      testPdfBuffer,
      'test-invoice.pdf',
      webhookUrl
    )

    return {
      success: true,
      message: `Webhook connected successfully. Returned document type: ${response.document_type || 'unclassified'}`,
    }
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error ? error.message : 'Unknown error occurred',
    }
  }
}
