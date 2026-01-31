/**
 * Webhook Client for n8n Invoice Processing
 *
 * Sends PDF files to external webhook for automated data extraction
 */

/**
 * Validate webhook URL to prevent SSRF attacks
 * Blocks private networks, localhost, and non-HTTPS URLs in production
 */
function validateWebhookUrl(urlString: string): void {
  let url: URL
  try {
    url = new URL(urlString)
  } catch {
    throw new Error('Invalid webhook URL format')
  }

  // Only allow http and https protocols
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Webhook URL must use HTTP or HTTPS protocol')
  }

  // In production, require HTTPS
  if (process.env.NODE_ENV === 'production' && url.protocol !== 'https:') {
    throw new Error('Webhook URL must use HTTPS in production')
  }

  const hostname = url.hostname.toLowerCase()

  // Block localhost and loopback
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '::1' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local')
  ) {
    throw new Error('Webhook URL cannot point to localhost')
  }

  // Block private IP ranges
  const ipv4Match = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (ipv4Match) {
    const [, a, b] = ipv4Match.map(Number)
    // 10.0.0.0/8
    if (a === 10) {
      throw new Error('Webhook URL cannot point to private network (10.x.x.x)')
    }
    // 172.16.0.0/12
    if (a === 172 && b >= 16 && b <= 31) {
      throw new Error('Webhook URL cannot point to private network (172.16-31.x.x)')
    }
    // 192.168.0.0/16
    if (a === 192 && b === 168) {
      throw new Error('Webhook URL cannot point to private network (192.168.x.x)')
    }
    // 169.254.0.0/16 (link-local)
    if (a === 169 && b === 254) {
      throw new Error('Webhook URL cannot point to link-local address')
    }
    // 127.0.0.0/8 (loopback)
    if (a === 127) {
      throw new Error('Webhook URL cannot point to loopback address')
    }
  }

  // Block cloud metadata endpoints
  const blockedHosts = [
    '169.254.169.254', // AWS/GCP/Azure metadata
    'metadata.google.internal',
    'metadata.goog',
  ]
  if (blockedHosts.includes(hostname)) {
    throw new Error('Webhook URL cannot point to cloud metadata service')
  }
}

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

/**
 * Send PDF to webhook for processing
 *
 * @param pdfBuffer - PDF file as Buffer
 * @param filename - Original filename
 * @param webhookUrl - External webhook endpoint URL
 * @returns Parsed invoice data from webhook
 * @throws Error if webhook fails or returns invalid data
 */
export async function sendPdfToWebhook(
  pdfBuffer: Buffer,
  filename: string,
  webhookUrl: string
): Promise<WebhookResponse> {
  // Validate URL to prevent SSRF attacks
  validateWebhookUrl(webhookUrl)

  try {
    // Create FormData with PDF file
    const formData = new FormData()
    const blob = new Blob([pdfBuffer], { type: 'application/pdf' })
    formData.append('file', blob, filename)

    // Send to webhook with 30-second timeout
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 30000)

    const response = await fetch(webhookUrl, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      throw new Error(
        `Webhook returned ${response.status}: ${response.statusText}`
      )
    }

    // Parse JSON response - handle nested structure
    const rawResponse = await response.json()

    // Extract data from nested path: [0].message.content
    // The webhook returns an array with structure: [{ message: { content: { ...invoice_data } } }]
    let data: WebhookResponse
    if (Array.isArray(rawResponse) && rawResponse[0]?.message?.content) {
      data = rawResponse[0].message.content as WebhookResponse
    } else if (rawResponse.message?.content) {
      // Fallback for single object with nested structure
      data = rawResponse.message.content as WebhookResponse
    } else {
      // Fallback to flat structure for compatibility
      data = rawResponse as WebhookResponse
    }

    // Validate response has required fields
    if (!data || typeof data !== 'object') {
      throw new Error('Webhook returned invalid response format')
    }

    // Return parsed data (all fields optional, webhook may return empty strings)
    return {
      invoice_number: data.invoice_number || '',
      issue_date: data.issue_date || '',
      supplier_name: data.supplier_name || '',
      supplier_vat_number: data.supplier_vat_number || '',
      total_without_vat: data.total_without_vat || '',
      total_vat: data.total_vat || '',
      invoice_total: data.invoice_total || '',
      currency: data.currency || '',
      numb_pages: data.numb_pages || 0,
      document_type: data.document_type || '',
    }
  } catch (error) {
    // Handle specific error types
    if (error instanceof Error) {
      if (error.name === 'AbortError') {
        throw new Error('Webhook request timed out after 30 seconds')
      }
      throw new Error(`Webhook processing failed: ${error.message}`)
    }
    throw new Error('Webhook processing failed: Unknown error')
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
