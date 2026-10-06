import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { encryptSecret, isEncryptionConfigured, keyHint } from '@/lib/crypto'
import { PROVIDERS, isSupportedProvider, validateApiKey } from '@/lib/classifier/providers'

/**
 * Per-user LLM API key management.
 *
 * The plaintext key enters on POST and is never readable again through any
 * route — GET returns only the display hint. That is deliberate: an endpoint
 * that can return a decrypted third-party billing credential is a liability
 * with no legitimate caller, since the server is the only thing that ever needs
 * the real value.
 */

export async function GET() {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = await createClient()

        // encrypted_key is deliberately absent from this projection.
        const { data, error } = await supabase
            .from('user_api_keys')
            .select('id, provider, key_hint, status, last_validated_at, last_error, created_at')
            .eq('user_id', user.id)
            .order('created_at', { ascending: false })

        if (error) {
            console.error('[API Key] List failed:', error)
            return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
        }

        return NextResponse.json({
            keys: data ?? [],
            encryptionConfigured: isEncryptionConfigured(),
        })
    } catch (error) {
        console.error('[API Key] List failed:', error)
        return NextResponse.json({ error: 'Failed to load API keys' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Fail before touching the key: storing it unencrypted because the
        // server is misconfigured is exactly the outcome this feature exists to
        // avoid.
        if (!isEncryptionConfigured()) {
            return NextResponse.json(
                {
                    error:
                        'Encriptação não configurada no servidor (ENCRYPTION_KEY em falta). Contacte o administrador.',
                },
                { status: 503 }
            )
        }

        const body = await request.json().catch(() => ({}))
        const { provider, apiKey } = body ?? {}

        if (!isSupportedProvider(provider)) {
            return NextResponse.json({ error: 'Fornecedor não suportado.' }, { status: 400 })
        }

        if (typeof apiKey !== 'string' || !apiKey.trim()) {
            return NextResponse.json({ error: 'Chave em falta.' }, { status: 400 })
        }

        const trimmedKey = apiKey.trim()

        if (!PROVIDERS[provider].keyPattern.test(trimmedKey)) {
            return NextResponse.json(
                { error: `A chave não tem o formato esperado (${PROVIDERS[provider].placeholder}).` },
                { status: 400 }
            )
        }

        // Verified before storage, so a typo surfaces immediately instead of at
        // the next sync as a silent classification failure.
        const validation = await validateApiKey(provider, trimmedKey)

        if (!validation.valid) {
            return NextResponse.json(
                { error: validation.error ?? 'A chave não pôde ser validada.' },
                { status: 400 }
            )
        }

        const supabase = await createClient()

        const { error } = await supabase
            .from('user_api_keys')
            // @ts-ignore - Supabase row types infer as never across this project
            .upsert(
                {
                    user_id: user.id,
                    provider,
                    encrypted_key: encryptSecret(trimmedKey),
                    key_hint: keyHint(trimmedKey),
                    status: 'valid',
                    last_validated_at: new Date().toISOString(),
                    last_error: null,
                    updated_at: new Date().toISOString(),
                },
                { onConflict: 'user_id,provider' }
            )

        if (error) {
            console.error('[API Key] Save failed:', error)

            // A missing table means the migration has not been applied. That is
            // a setup problem with an obvious fix, so say so rather than
            // returning a generic failure that sends the user hunting.
            const isMissingTable =
                error.message?.includes('user_api_keys') &&
                (error.message.includes('does not exist') ||
                    error.message.includes('schema cache'))

            return NextResponse.json(
                {
                    error: isMissingTable
                        ? 'A tabela user_api_keys não existe. Aplique a migração 022_user_api_keys.sql no Supabase.'
                        : 'Falha ao guardar a chave.',
                },
                { status: 500 }
            )
        }

        return NextResponse.json({
            success: true,
            provider,
            keyHint: keyHint(trimmedKey),
        })
    } catch (error) {
        console.error('[API Key] Save failed:', error)
        return NextResponse.json(
            {
                error: 'Falha ao guardar a chave.',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
            { status: 500 }
        )
    }
}

export async function DELETE(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { searchParams } = new URL(request.url)
        const provider = searchParams.get('provider')

        if (!isSupportedProvider(provider)) {
            return NextResponse.json({ error: 'Fornecedor não suportado.' }, { status: 400 })
        }

        const supabase = await createClient()

        const { error } = await supabase
            .from('user_api_keys')
            .delete()
            .eq('user_id', user.id)
            .eq('provider', provider)

        if (error) {
            console.error('[API Key] Delete failed:', error)
            return NextResponse.json({ error: 'Falha ao remover a chave.' }, { status: 500 })
        }

        // Removing the key that the active backend depends on would otherwise
        // leave classification silently broken. Fall back to the webhook path.
        const { data: settings } = await supabase
            .from('user_settings')
            .select('classifier_backend')
            .eq('user_id', user.id)
            .maybeSingle()

        if ((settings as any)?.classifier_backend === provider) {
            await supabase
                .from('user_settings')
                // @ts-ignore - Supabase row types infer as never across this project
                .update({ classifier_backend: 'webhook' })
                .eq('user_id', user.id)
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[API Key] Delete failed:', error)
        return NextResponse.json({ error: 'Falha ao remover a chave.' }, { status: 500 })
    }
}
