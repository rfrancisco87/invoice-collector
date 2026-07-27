/**
 * OpenAI classification backend.
 *
 * Uses the Responses API, which accepts a PDF as an `input_file` — the Chat
 * Completions endpoint cannot take PDFs directly, and routing through a text
 * extractor would lose the table structure that invoice totals live in.
 *
 * Structured output comes from a strict `json_schema` text format, the
 * equivalent of Anthropic's forced tool use: the model cannot reply in prose.
 *
 * Same prompt and schema as the Anthropic path, so accuracy differences between
 * providers reflect the models rather than the wiring.
 */

import {
    CLASSIFICATION_SCHEMA,
    buildSystemPrompt,
    buildUserPrompt,
    type PromptContext,
    type RawClassification,
} from '@/lib/classifier/providers/prompt'
import type { ProviderCallResult } from '@/lib/classifier/providers/anthropic'

/**
 * Default model. Overridable per user, which matters more here than for
 * Anthropic: OpenAI model names change often, and a user whose account lacks
 * this one needs to be able to fix it without waiting for a deploy.
 */
export const OPENAI_DEFAULT_MODEL = 'gpt-4o-mini'

const API_URL = 'https://api.openai.com/v1/responses'
const TIMEOUT_MS = 60_000

export async function classifyWithOpenAI(
    apiKey: string,
    pdf: Buffer,
    context: PromptContext,
    model: string = OPENAI_DEFAULT_MODEL,
): Promise<ProviderCallResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                model,
                instructions: buildSystemPrompt(),
                input: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'input_file',
                                filename: context.filename,
                                file_data: `data:application/pdf;base64,${pdf.toString('base64')}`,
                            },
                            { type: 'input_text', text: buildUserPrompt(context) },
                        ],
                    },
                ],
                text: {
                    format: {
                        type: 'json_schema',
                        name: 'classification',
                        strict: true,
                        schema: CLASSIFICATION_SCHEMA,
                    },
                },
            }),
        })

        if (!response.ok) {
            const body = await response.text().catch(() => '')
            return {
                raw: null,
                model,
                inputTokens: 0,
                outputTokens: 0,
                error: describeError(response.status, body),
            }
        }

        const data = await response.json()

        const inputTokens = data?.usage?.input_tokens ?? 0
        const outputTokens = data?.usage?.output_tokens ?? 0

        const text = extractOutputText(data)

        if (!text) {
            return {
                raw: null,
                model,
                inputTokens,
                outputTokens,
                error: 'O modelo não devolveu uma classificação estruturada.',
            }
        }

        try {
            return { raw: JSON.parse(text) as RawClassification, model, inputTokens, outputTokens }
        } catch {
            return {
                raw: null,
                model,
                inputTokens,
                outputTokens,
                error: 'A resposta do modelo não era JSON válido.',
            }
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return { raw: null, model, inputTokens: 0, outputTokens: 0, error: 'Tempo limite excedido.' }
        }

        return {
            raw: null,
            model,
            inputTokens: 0,
            outputTokens: 0,
            error: error instanceof Error ? error.message : 'Erro desconhecido.',
        }
    } finally {
        clearTimeout(timeout)
    }
}

/**
 * Pull the JSON payload out of a Responses API result.
 *
 * `output_text` is the convenience field; the nested walk is the fallback for
 * responses that do not include it.
 */
function extractOutputText(data: any): string | null {
    if (typeof data?.output_text === 'string' && data.output_text.trim()) {
        return data.output_text
    }

    for (const item of data?.output ?? []) {
        for (const block of item?.content ?? []) {
            if (typeof block?.text === 'string' && block.text.trim()) return block.text
        }
    }

    return null
}

function describeError(status: number, body: string): string {
    let detail = ''
    try {
        detail = JSON.parse(body)?.error?.message ?? ''
    } catch {
        detail = ''
    }

    switch (status) {
        case 401:
        case 403:
            return 'Chave de API rejeitada. Verifique a chave nas definições.'
        case 404:
            return `Modelo não encontrado ou indisponível na sua conta.${detail ? ` (${detail})` : ''}`
        case 400:
            return `Pedido inválido: ${detail || 'verifique o modelo configurado.'}`
        case 429:
            return 'Limite de pedidos ou saldo esgotado no fornecedor.'
        default:
            if (status >= 500) return 'O fornecedor está indisponível. Tente mais tarde.'
            return `O fornecedor respondeu ${status}.${detail ? ` ${detail}` : ''}`
    }
}
