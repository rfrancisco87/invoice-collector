/**
 * LLM provider registry.
 *
 * Phase 3 scope is credential handling: recognising a key's shape and proving
 * it works. The classification calls themselves land in Phase 4b behind the
 * same ClassifyResult contract the webhook already satisfies, so ingestion does
 * not change again when they arrive.
 */

export type LlmProvider = 'anthropic' | 'openai'

export const SUPPORTED_PROVIDERS: LlmProvider[] = ['anthropic', 'openai']

export function isSupportedProvider(value: unknown): value is LlmProvider {
    return typeof value === 'string' && SUPPORTED_PROVIDERS.includes(value as LlmProvider)
}

export interface ProviderInfo {
    id: LlmProvider
    label: string
    /** Where the user goes to create a key. */
    consoleUrl: string
    /** Shape check, to catch a pasted-wrong-thing before spending a network call. */
    keyPattern: RegExp
    placeholder: string
}

export const PROVIDERS: Record<LlmProvider, ProviderInfo> = {
    anthropic: {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        consoleUrl: 'https://console.anthropic.com/settings/keys',
        keyPattern: /^sk-ant-[A-Za-z0-9_-]{20,}$/,
        placeholder: 'sk-ant-...',
    },
    openai: {
        id: 'openai',
        label: 'OpenAI',
        consoleUrl: 'https://platform.openai.com/api-keys',
        // OpenAI has shipped several key formats (sk-, sk-proj-, sk-svcacct-),
        // so this stays deliberately loose — the validation call is the real
        // check, and rejecting a legitimate new format would be worse than
        // letting one extra request through.
        keyPattern: /^sk-[A-Za-z0-9_-]{20,}$/,
        placeholder: 'sk-...',
    },
}

export interface KeyValidationResult {
    valid: boolean
    /** Present when invalid — safe to show the user, never contains the key. */
    error?: string
}

/** Guard against a hung provider holding a request open. */
const VALIDATION_TIMEOUT_MS = 15_000

/**
 * Prove a key works by calling a provider endpoint that lists models.
 *
 * Both providers expose model listing, which authenticates the key without
 * running inference — so validating costs the user nothing. A generation call
 * would bill them for the privilege of saving a key.
 */
export async function validateApiKey(
    provider: LlmProvider,
    apiKey: string,
): Promise<KeyValidationResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), VALIDATION_TIMEOUT_MS)

    try {
        const request =
            provider === 'anthropic'
                ? fetch('https://api.anthropic.com/v1/models?limit=1', {
                    headers: {
                        'x-api-key': apiKey,
                        'anthropic-version': '2023-06-01',
                    },
                    signal: controller.signal,
                })
                : fetch('https://api.openai.com/v1/models', {
                    headers: { Authorization: `Bearer ${apiKey}` },
                    signal: controller.signal,
                })

        const response = await request

        if (response.ok) return { valid: true }

        if (response.status === 401 || response.status === 403) {
            return { valid: false, error: 'A chave foi rejeitada pelo fornecedor.' }
        }

        if (response.status === 429) {
            // Rate limiting proves the key authenticated, so this is not an
            // invalid key — refusing to save it here would be wrong.
            return { valid: true }
        }

        return {
            valid: false,
            error: `O fornecedor respondeu ${response.status}. Tente novamente.`,
        }
    } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
            return { valid: false, error: 'O fornecedor não respondeu a tempo.' }
        }

        return { valid: false, error: 'Não foi possível contactar o fornecedor.' }
    } finally {
        clearTimeout(timeout)
    }
}
