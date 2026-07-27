/**
 * Anthropic classification backend.
 *
 * PDFs go to the model directly as a `document` content block — no text
 * extraction step, so layout, tables and scanned pages survive, which is where
 * a text-only pipeline loses invoice totals.
 *
 * Structured output is forced through tool use with `tool_choice`, so the model
 * cannot answer in prose and the response never needs to be parsed out of free
 * text.
 *
 * Called over fetch rather than the SDK: the app needs exactly one endpoint,
 * and the request is built from a per-user key that must not end up in a
 * module-level client.
 */

import {
    CLASSIFICATION_SCHEMA,
    CLASSIFICATION_TOOL_NAME,
    buildSystemPrompt,
    buildUserPrompt,
    type PromptContext,
    type RawClassification,
} from '@/lib/classifier/providers/prompt'

/**
 * Default model. Haiku is the right tier for this: classification of a
 * single short document is a high-volume, low-reasoning task, and the user is
 * paying per document out of their own account. Overridable per user via
 * user_settings.classifier_model.
 */
export const ANTHROPIC_DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const TIMEOUT_MS = 60_000

export interface ProviderCallResult {
    raw: RawClassification | null
    model: string
    inputTokens: number
    outputTokens: number
    error?: string
}

export async function classifyWithAnthropic(
    apiKey: string,
    pdf: Buffer,
    context: PromptContext,
    model: string = ANTHROPIC_DEFAULT_MODEL,
): Promise<ProviderCallResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS)

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'x-api-key': apiKey,
                'anthropic-version': API_VERSION,
                'content-type': 'application/json',
            },
            signal: controller.signal,
            body: JSON.stringify({
                model,
                max_tokens: 1024,
                system: buildSystemPrompt(),
                tools: [
                    {
                        name: CLASSIFICATION_TOOL_NAME,
                        description: 'Record the classification and extracted fields.',
                        input_schema: CLASSIFICATION_SCHEMA,
                    },
                ],
                // Forces the model to answer through the schema rather than
                // deciding for itself whether a tool call is warranted.
                tool_choice: { type: 'tool', name: CLASSIFICATION_TOOL_NAME },
                messages: [
                    {
                        role: 'user',
                        content: [
                            {
                                type: 'document',
                                source: {
                                    type: 'base64',
                                    media_type: 'application/pdf',
                                    data: pdf.toString('base64'),
                                },
                            },
                            { type: 'text', text: buildUserPrompt(context) },
                        ],
                    },
                ],
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

        const toolUse = (data?.content ?? []).find(
            (block: any) => block?.type === 'tool_use' && block?.name === CLASSIFICATION_TOOL_NAME,
        )

        if (!toolUse?.input) {
            // Tokens were still spent, so they are reported even though the
            // response was unusable.
            return {
                raw: null,
                model,
                inputTokens,
                outputTokens,
                error: 'O modelo não devolveu uma classificação estruturada.',
            }
        }

        return {
            raw: toolUse.input as RawClassification,
            model,
            inputTokens,
            outputTokens,
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
 * Turn an HTTP failure into something the user can act on. These surface in the
 * document's classification_reason, so "402" alone would be useless.
 */
function describeError(status: number, body: string): string {
    // The provider echoes the useful part in a JSON error object.
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
        case 413:
            return 'O PDF é demasiado grande para o modelo.'
        case 429:
            return 'Limite de pedidos atingido no fornecedor. Tente mais tarde.'
        default:
            if (status >= 500) return 'O fornecedor está indisponível. Tente mais tarde.'
            return `O fornecedor respondeu ${status}.${detail ? ` ${detail}` : ''}`
    }
}
