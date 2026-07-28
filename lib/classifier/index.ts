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

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendPdfToWebhook } from '@/lib/webhook'
import { classifyWithLlm } from '@/lib/classifier/llm'
import { prefilterDocument, type PrefilterResult } from '@/lib/classifier/prefilter'
import {
    collectPromptHints,
    evaluateStage,
    type AppliedRule,
    type ClassificationRule,
} from '@/lib/classifier/rules'
import {
    classificationFromVariant,
    variantFromDocumentType,
    type ClassifyInput,
    type ClassifyResult,
} from '@/lib/classifier/types'

export * from '@/lib/classifier/types'
export { prefilterDocument } from '@/lib/classifier/prefilter'
export type { PrefilterResult } from '@/lib/classifier/prefilter'
export * from '@/lib/classifier/rules'

/**
 * A pre-filter verdict plus whichever user rules fired.
 *
 * Kept separate from PrefilterResult so lib/classifier/prefilter.ts stays a
 * pure function of the document's metadata, with no knowledge of user rules.
 */
export interface PrefilterOutcome extends PrefilterResult {
    appliedRules: AppliedRule[]
}

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
    /** Which backend to try first. Defaults to the webhook. */
    classifier_backend?: 'webhook' | 'anthropic' | 'openai' | null
    /** Model override; null uses the provider default. */
    classifier_model?: string | null
}

/**
 * Everything the LLM path needs that the webhook path does not: a database
 * handle to read the encrypted key from, and the user to read it for.
 */
export interface ClassifierContext {
    supabase?: SupabaseClient<any, any, any>
    userId?: string
    /** User-defined rules, loaded once per document by the caller. */
    rules?: ClassificationRule[]
}

/**
 * Load this user's enabled rules.
 *
 * Read once per document rather than per stage — the same set feeds the
 * pre-filter, the prompt and the post-decision gate, and three round trips per
 * document would be wasteful during a sweep.
 */
export async function loadRules(
    supabase: SupabaseClient<any, any, any>,
    userId: string,
): Promise<ClassificationRule[]> {
    const { data, error } = await supabase
        .from('classification_rules')
        .select('id, name, enabled, priority, stage, match_type, match_value, action')
        .eq('user_id', userId)
        .eq('enabled', true)

    if (error) {
        // Rules are an enhancement; failing to read them must not stop documents
        // being processed with the built-in behaviour.
        console.error('[Classifier] Failed to load rules:', error)
        return []
    }

    return (data as any[]) ?? []
}

export interface PipelineResult {
    /** Layer A verdict. When 'skip', no classifier was called. */
    prefilter: PrefilterOutcome | null
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
    rules: ClassificationRule[] = [],
): PrefilterOutcome | null {
    const matchInput = {
        filename: input.filename,
        subject: input.subject,
        sender: input.sender,
        senderDomain: input.senderDomain,
    }

    // User rules are evaluated before the built-in heuristics and win outright.
    // Someone who wrote "never process anything from this domain" means it, and
    // a filename heuristic should not be able to overrule them.
    const userRules = evaluateStage(rules, 'pre_filter', matchInput)

    if (userRules.decision === 'skip') {
        return {
            verdict: 'skip',
            matched: { positive: [], negative: [] },
            reason: `Regra "${userRules.decidedBy}" — ignorado`,
            appliedRules: userRules.applied,
        }
    }

    // force_invoice at this stage means "always process", so the built-in
    // pre-filter is bypassed rather than allowed to discard the document.
    if (userRules.decision === 'force_invoice' || userRules.decision === 'require_review') {
        return {
            verdict: 'pass',
            matched: { positive: [], negative: [] },
            reason: `Regra "${userRules.decidedBy}" — sempre processar`,
            appliedRules: userRules.applied,
        }
    }

    if (settings.prefilter_enabled === false) {
        return userRules.applied.length > 0
            ? {
                verdict: 'pass',
                matched: { positive: [], negative: [] },
                reason: 'Filtro prévio desativado',
                appliedRules: userRules.applied,
            }
            : null
    }

    const builtIn = prefilterDocument(matchInput)
    return { ...builtIn, appliedRules: userRules.applied }
}

/**
 * Post-decision rules (Layer C).
 *
 * Applied after the classifier answers, so a user can correct a backend that is
 * reliably wrong about a particular sender without waiting for a better model.
 */
export function applyPostDecisionRules(
    result: ClassifyResult,
    rules: ClassificationRule[],
    input: Omit<ClassifyInput, 'fileData'>,
): { result: ClassifyResult; applied: AppliedRule[]; forcedReview: boolean } {
    const evaluation = evaluateStage(rules, 'post_decision', {
        filename: input.filename,
        subject: input.subject,
        sender: input.sender,
        senderDomain: input.senderDomain,
    })

    if (!evaluation.decision) {
        return { result, applied: evaluation.applied, forcedReview: false }
    }

    switch (evaluation.decision) {
        case 'force_invoice':
            return {
                result: {
                    ...result,
                    classification: 'invoice',
                    variant: 'invoice',
                    // Confidence is pinned to 1 because this is no longer the
                    // model's judgement — it is the user's instruction, and it
                    // must not be second-guessed by the confidence gate.
                    confidence: 1,
                    reason: `Regra "${evaluation.decidedBy}" — forçado como fatura`,
                },
                applied: evaluation.applied,
                forcedReview: false,
            }

        case 'force_not_invoice':
            return {
                result: {
                    ...result,
                    classification: 'unclassified',
                    variant: 'other',
                    confidence: 1,
                    reason: `Regra "${evaluation.decidedBy}" — forçado como não-fatura`,
                },
                applied: evaluation.applied,
                forcedReview: false,
            }

        case 'require_review':
            return {
                result: { ...result, reason: `${result.reason} · Regra "${evaluation.decidedBy}"` },
                applied: evaluation.applied,
                forcedReview: true,
            }

        default:
            return { result, applied: evaluation.applied, forcedReview: false }
    }
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
    context: ClassifierContext = {},
): Promise<ClassifyResult> {
    const backend = settings.classifier_backend ?? 'webhook'

    // LLM backend, when one is selected and we have what it needs.
    if (backend !== 'webhook' && context.supabase && context.userId) {
        const llmResult = await classifyWithLlm({
            supabase: context.supabase,
            userId: context.userId,
            provider: backend,
            model: settings.classifier_model,
            pdf: input.fileData,
            context: {
                filename: input.filename,
                subject: input.subject,
                sender: input.sender,
                hints: collectPromptHints(context.rules ?? []),
            },
        })

        // null means "no usable key for this provider" — fall through to the
        // webhook rather than failing the document. An actual provider error
        // returns a result and is reported as such, because silently falling
        // back would hide a broken key behind webhook results forever.
        if (llmResult) return llmResult
    }

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
