import { DocumentProcessorServiceClient } from '@google-cloud/documentai'
import { INVOICE_KEYWORDS, CREDIT_NOTE_KEYWORDS } from './constants'

export type DocumentClassification = 'invoice' | 'credit_note' | 'unclassified'

export interface ClassificationResult {
  classification: DocumentClassification
  confidence: number
  extractedText: string
}

// Simple text-based classification (we can enhance with Document AI later)
export async function classifyDocument(
  pdfData: Buffer,
  filename: string
): Promise<ClassificationResult> {
  // For MVP, use simple keyword-based classification
  // In production, you would use Google Document AI here

  const text = filename.toLowerCase()

  let classification: DocumentClassification = 'unclassified'
  let confidence = 0.5

  // Check for credit note keywords (more specific, check first)
  const creditNoteMatch = CREDIT_NOTE_KEYWORDS.some(keyword => text.includes(keyword))
  if (creditNoteMatch) {
    classification = 'credit_note'
    confidence = 0.8
  } else {
    // Check for invoice keywords
    const invoiceMatch = INVOICE_KEYWORDS.some(keyword => text.includes(keyword))
    if (invoiceMatch) {
      classification = 'invoice'
      confidence = 0.8
    }
  }

  return {
    classification,
    confidence,
    extractedText: filename,
  }
}

// Future: Real Document AI integration
export async function classifyDocumentWithAI(
  pdfData: Buffer,
  projectId: string,
  location: string,
  processorId: string
): Promise<ClassificationResult> {
  try {
    const client = new DocumentProcessorServiceClient()

    const name = `projects/${projectId}/locations/${location}/processors/${processorId}`

    const request = {
      name,
      rawDocument: {
        content: pdfData.toString('base64'),
        mimeType: 'application/pdf',
      },
    }

    const [result] = await client.processDocument(request)
    const document = result.document

    if (!document || !document.text) {
      return {
        classification: 'unclassified',
        confidence: 0,
        extractedText: '',
      }
    }

    const text = document.text.toLowerCase()

    // Analyze extracted text for classification
    let classification: DocumentClassification = 'unclassified'
    let confidence = 0.5

    const creditNoteScore = CREDIT_NOTE_KEYWORDS.filter(keyword =>
      text.includes(keyword)
    ).length

    const invoiceScore = INVOICE_KEYWORDS.filter(keyword =>
      text.includes(keyword)
    ).length

    if (creditNoteScore > 0) {
      classification = 'credit_note'
      confidence = Math.min(0.6 + creditNoteScore * 0.1, 0.95)
    } else if (invoiceScore > 0) {
      classification = 'invoice'
      confidence = Math.min(0.6 + invoiceScore * 0.1, 0.95)
    }

    return {
      classification,
      confidence,
      extractedText: document.text,
    }
  } catch (error) {
    console.error('Document AI classification failed:', error)
    // Fallback to simple classification
    return classifyDocument(pdfData, '')
  }
}
