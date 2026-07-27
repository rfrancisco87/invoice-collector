/**
 * Classifier contract.
 *
 * Every classification path — the existing n8n webhook, and the LLM providers
 * that follow in Phase 4b — resolves to this one shape. That is what lets the
 * pre-filter (Layer A) and the confidence gate (Layer C) apply uniformly,
 * including to users who never configure an API key.
 */

import type { WebhookResponse } from '@/lib/webhook'

export type DocumentClassification = 'invoice' | 'credit_note' | 'unclassified'

/**
 * What kind of document this is, independent of whether we want to keep it.
 *
 * Distinguishing `receipt` from `invoice` matters: senders like Stripe attach
 * both to one email, and the current pipeline throws receipts away because
 * anything that is not `supplier_invoice` gets deleted. Phase 4.5 pairs them.
 */
export type DocumentVariant = 'invoice' | 'receipt' | 'credit_note' | 'other'

export type ClassificationSource = 'prefilter' | 'webhook' | 'llm' | 'none'

export interface ClassifyResult {
    /** Classification as stored on the document row. */
    classification: DocumentClassification
    /** Finer-grained document kind, used for sibling pairing. */
    variant: DocumentVariant
    /** 0..1. Below the user's threshold the document is flagged needs_review. */
    confidence: number
    /** Which layer decided. */
    source: ClassificationSource
    /** Human-readable justification, surfaced in the UI. */
    reason: string
    /** Extracted invoice fields, when the classifier provides them. */
    fields: WebhookResponse | null
    /** Populated when the classifier failed rather than returned a verdict. */
    error?: string
    /** Model that produced this, for LLM backends. Null for webhook/prefilter. */
    model?: string | null
}

export interface ClassifyInput {
    fileData: Buffer
    filename: string
    subject?: string | null
    sender?: string | null
    senderDomain?: string | null
}

/**
 * Map the webhook's `document_type` string onto our own taxonomy.
 *
 * The webhook vocabulary is fixed by the n8n workflow; anything unrecognised is
 * treated as `other` rather than assumed to be an invoice.
 */
export function variantFromDocumentType(documentType: string | null | undefined): DocumentVariant {
    const normalised = (documentType ?? '').trim().toLowerCase()

    switch (normalised) {
        case 'supplier_invoice':
        case 'invoice':
        case 'fatura':
            return 'invoice'
        case 'credit_note':
        case 'nota_credito':
            return 'credit_note'
        case 'receipt':
        case 'recibo':
            return 'receipt'
        default:
            return 'other'
    }
}

export function classificationFromVariant(variant: DocumentVariant): DocumentClassification {
    switch (variant) {
        case 'invoice':
            return 'invoice'
        case 'credit_note':
            return 'credit_note'
        default:
            return 'unclassified'
    }
}
