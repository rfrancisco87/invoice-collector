/**
 * LLM backend resolution and dispatch.
 *
 * Sits between the pipeline in lib/classifier/index.ts and the provider
 * modules: works out whether this user has a usable key, decrypts it, calls the
 * right provider, normalises the answer into a ClassifyResult, and records the
 * spend.
 *
 * Decryption happens here and nowhere else in the request path, and the
 * plaintext key never leaves this function's scope.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret } from '@/lib/crypto'
import {
    ANTHROPIC_DEFAULT_MODEL,
    classifyWithAnthropic,
    type ProviderCallResult,
} from '@/lib/classifier/providers/anthropic'
import { OPENAI_DEFAULT_MODEL, classifyWithOpenAI } from '@/lib/classifier/providers/openai'
import type { LlmProvider } from '@/lib/classifier/providers'
import type { PromptContext, RawClassification } from '@/lib/classifier/providers/prompt'
import {
    classificationFromVariant,
    type ClassifyResult,
    type DocumentVariant,
} from '@/lib/classifier/types'
import type { WebhookResponse } from '@/lib/webhook'

export interface LlmClassifyOptions {
    supabase: SupabaseClient<any, any, any>
    userId: string
    provider: LlmProvider
    /** user_settings.classifier_model; null uses the provider default. */
    model?: string | null
    pdf: Buffer
    context: PromptContext
}

/**
 * Classify using the user's own provider key.
 *
 * Returns null when the user has no usable key for this provider, so the caller
 * can fall back to the webhook rather than failing the document.
 */
export async function classifyWithLlm(
    options: LlmClassifyOptions,
): Promise<ClassifyResult | null> {
    const { supabase, userId, provider, model, pdf, context } = options

    const { data: keyRow } = await supabase
        .from('user_api_keys')
        .select('encrypted_key, status')
        .eq('user_id', userId)
        .eq('provider', provider)
        .maybeSingle()

    const row = keyRow as any
    if (!row?.encrypted_key) return null

    let apiKey: string
    try {
        apiKey = decryptSecret(row.encrypted_key)
    } catch (error) {
        // A key that cannot be decrypted usually means ENCRYPTION_KEY changed.
        // Surface it rather than silently falling back, because every future
        // call will fail the same way until someone re-saves the key.
        console.error('[LLM] Failed to decrypt API key:', error)
        return {
            classification: 'unclassified',
            variant: 'other',
            confidence: 0,
            source: 'llm',
            reason:
                'Não foi possível desencriptar a chave de API. Volte a guardá-la nas definições.',
            fields: null,
            error: 'decryption_failed',
        }
    }

    const resolvedModel =
        model?.trim() || (provider === 'anthropic' ? ANTHROPIC_DEFAULT_MODEL : OPENAI_DEFAULT_MODEL)

    const result: ProviderCallResult =
        provider === 'anthropic'
            ? await classifyWithAnthropic(apiKey, pdf, context, resolvedModel)
            : await classifyWithOpenAI(apiKey, pdf, context, resolvedModel)

    // Logged before interpreting the result: a failed call is still billed, and
    // omitting it would make the ledger disagree with the provider's invoice.
    await recordUsage(supabase, {
        userId,
        provider,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        succeeded: !!result.raw,
        error: result.error,
    })

    if (!result.raw) {
        return {
            classification: 'unclassified',
            variant: 'other',
            confidence: 0,
            source: 'llm',
            reason: result.error ?? 'A classificação falhou.',
            fields: null,
            error: result.error ?? 'llm_failed',
            model: result.model,
        }
    }

    return normalise(result.raw, result.model)
}

/**
 * Convert a provider response into a ClassifyResult.
 *
 * The model's self-reported confidence is trusted but bounded — a malformed or
 * out-of-range number must not be able to slip past the confidence gate, so
 * anything unparseable is treated as maximally uncertain rather than ignored.
 */
function normalise(raw: RawClassification, model: string): ClassifyResult {
    const variant = normaliseVariant(raw.variant)

    const parsedConfidence = Number(raw.confidence)
    const confidence = Number.isFinite(parsedConfidence)
        ? Math.min(1, Math.max(0, parsedConfidence))
        : 0

    const fields: WebhookResponse = {
        invoice_number: raw.invoice_number ?? '',
        issue_date: raw.issue_date ?? '',
        supplier_name: raw.supplier_name ?? '',
        supplier_vat_number: raw.supplier_vat_number ?? '',
        total_without_vat: raw.total_without_vat ?? '',
        total_vat: raw.total_vat ?? '',
        invoice_total: raw.invoice_total ?? '',
        currency: raw.currency ?? '',
        numb_pages: raw.numb_pages ?? 0,
        document_type: variant,
    }

    return {
        classification: classificationFromVariant(variant),
        variant,
        confidence,
        source: 'llm',
        reason: raw.reason?.trim() || 'Classificado pelo modelo.',
        fields,
        model,
    }
}

function normaliseVariant(value: string): DocumentVariant {
    switch ((value ?? '').trim().toLowerCase()) {
        case 'invoice':
            return 'invoice'
        case 'receipt':
            return 'receipt'
        case 'credit_note':
            return 'credit_note'
        default:
            return 'other'
    }
}

interface UsageRecord {
    userId: string
    provider: string
    model: string
    inputTokens: number
    outputTokens: number
    succeeded: boolean
    error?: string
    documentId?: string
}

/**
 * Append to the spend ledger. Never throws — losing a usage row is regrettable,
 * but failing a document because bookkeeping failed would be worse.
 */
async function recordUsage(
    supabase: SupabaseClient<any, any, any>,
    record: UsageRecord,
): Promise<void> {
    try {
        await supabase
            .from('llm_usage')
            // @ts-ignore - Supabase row types infer as never across this project
            .insert({
                user_id: record.userId,
                document_id: record.documentId ?? null,
                provider: record.provider,
                model: record.model,
                input_tokens: record.inputTokens,
                output_tokens: record.outputTokens,
                succeeded: record.succeeded,
                error: record.error ?? null,
            })
    } catch (error) {
        console.error('[LLM] Failed to record usage:', error)
    }
}
