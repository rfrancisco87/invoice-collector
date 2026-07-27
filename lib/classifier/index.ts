/**
 * Classification pipeline.
 *
 *   Layer A  prefilter    — deterministic, pre-upload, free
 *   Layer B  classify     — the configured backend (webhook today, LLM in 4b)
 *   Layer C  confidence   — gate the result instead of trusting it outright
 *
 * The pipeline is backend-agnostic on purpose: users still on the n8n webhook
 * get Layers A and C immediately, without configuring anything. That is where
 * most of the near-term accuracy improvement comes from, because the current
 * failure mode is not a bad model — it is that nothing filters obvious
 * non-invoices and nothing distinguishes a confident answer from a guess.
 */

import { sendPdfToWebhook } from '@/lib/webhook'
import { prefilterDocument, type PrefilterResult } from '@/lib/classifier/prefilter'
import {
    classificationFromVariant,
    variantFromDocumentType,
    type ClassifyInput,
    type ClassifyResult,
} from '@/lib/classifier/types'

export * from '@/lib/classifier/types'
export { prefilterDocument } from '@/lib/classifier/prefilter'
export type { PrefilterResult } from '@/lib/classifier/prefilter'

/**
 * The webhook returns no confidence signal at all — just a type string. Rather
 * than invent precision it does not have, a successful webhook answer is scored
 * at a fixed value below 1.0, marking it as "asserted, not measured".
 *
 * With the default threshold of 0.70 this passes the gate, so behaviour for
 * existing users is unchanged. Raise the threshold above this and every webhook
 * result becomes needs_review, which is a legitimate choice for someone who
 * wants to eyeball everything.
 */
const WEBHOOK_CONFIDENCE = 0.75

/** An unrecognised document type is a real signal, but a weak one. */
const WEBHOOK_UNKNOWN_TYPE_CONFIDENCE = 0.4

export interface ClassifierSettings {
    webhook_url?: string | null
    prefilter_enabled?: boolean | null
    classification_confidence_threshold?: number | null
}

export interface PipelineResult {
    /** Layer A verdict. When 'skip', no classifier was called. */
    prefilter: PrefilterResult | null
    /** Layer B result. Null when the pre-filter skipped the document. */
    classification: ClassifyResult | null
    /** Layer C: did the result clear the user's confidence threshold? */
    needsReview: boolean
    /** True when the document should not be stored at all. */
    skip: boolean
    /** Why, in one line — stored on the row and shown in the UI. */
    reason: string
}

/**
 * Run Layer A only. Separated so callers can bail out before uploading to Drive
 * — the whole point of the pre-filter is that it costs nothing.
 */
export function runPrefilter(
    input: Omit<ClassifyInput, 'fileData'>,
    settings: ClassifierSettings,
): PrefilterResult | null {
    if (settings.prefilter_enabled === false) return null

    return prefilterDocument({
        filename: input.filename,
        subject: input.subject,
        sender: input.sender,
        senderDomain: input.senderDomain,
    })
}

/**
 * Layer B: ask the configured backend.
 *
 * Returns a ClassifyResult even on failure, so callers have one shape to handle
 * and a failed classification is recorded rather than silently dropping the
 * document.
 */
export async function classifyDocument(
    input: ClassifyInput,
    settings: ClassifierSettings,
): Promise<ClassifyResult> {
    const webhookUrl = settings.webhook_url?.trim()

    if (!webhookUrl) {
        return {
            classification: 'unclassified',
            variant: 'other',
            confidence: 0,
            source: 'none',
            reason: 'Nenhum classificador configurado',
            fields: null,
        }
    }

    try {
        const response = await sendPdfToWebhook(input.fileData, input.filename, webhookUrl)
        const variant = variantFromDocumentType(response.document_type)

        if (variant === 'other') {
            return {
                classification: 'unclassified',
                variant,
                confidence: WEBHOOK_UNKNOWN_TYPE_CONFIDENCE,
                source: 'webhook',
                reason: `Classificado como "${response.document_type || 'desconhecido'}" — não é fatura nem nota de crédito`,
                fields: response,
            }
        }

        return {
            classification: classificationFromVariant(variant),
            variant,
            confidence: WEBHOOK_CONFIDENCE,
            source: 'webhook',
            reason: `Classificado como ${response.document_type} pelo webhook`,
            fields: response,
        }
    } catch (error) {
        const message = error instanceof Error ? error.message : 'Erro desconhecido'

        return {
            classification: 'unclassified',
            variant: 'other',
            confidence: 0,
            source: 'webhook',
            reason: `Falha na classificação: ${message}`,
            fields: null,
            error: message,
        }
    }
}

/**
 * Layer C: decide what to do with a classification.
 *
 * The important behaviour change is that a low-confidence result is no longer
 * either silently accepted or silently deleted. It is kept, marked
 * needs_review, and shown to the user with the reason — which is what turns a
 * misclassification from an invisible failure into a one-click correction.
 */
export function applyConfidenceGate(
    result: ClassifyResult,
    settings: ClassifierSettings,
): { needsReview: boolean; reason: string } {
    const threshold = settings.classification_confidence_threshold ?? 0.7

    // A hard failure is not a low-confidence judgement — there is no judgement.
    // Flag it so the user knows the document was never actually classified.
    if (result.error) {
        return { needsReview: true, reason: result.reason }
    }

    if (result.confidence < threshold) {
        return {
            needsReview: true,
            reason: `${result.reason} (confiança ${result.confidence.toFixed(2)} abaixo do limite ${threshold.toFixed(2)})`,
        }
    }

    return { needsReview: false, reason: result.reason }
}
