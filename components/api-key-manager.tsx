'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { AlertCircle, KeyRound, Trash2 } from 'lucide-react'

type Provider = 'anthropic' | 'openai'

interface StoredKey {
    id: string
    provider: Provider
    key_hint: string
    status: 'unverified' | 'valid' | 'invalid'
    last_validated_at: string | null
    last_error: string | null
}

const PROVIDER_LABELS: Record<Provider, { label: string; placeholder: string; console: string }> = {
    anthropic: {
        label: 'Anthropic (Claude)',
        placeholder: 'sk-ant-...',
        console: 'https://console.anthropic.com/settings/keys',
    },
    openai: {
        label: 'OpenAI',
        placeholder: 'sk-...',
        console: 'https://platform.openai.com/api-keys',
    },
}

export function ApiKeyManager() {
    const [keys, setKeys] = useState<StoredKey[]>([])
    const [provider, setProvider] = useState<Provider>('anthropic')
    const [apiKey, setApiKey] = useState('')
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)
    const [encryptionConfigured, setEncryptionConfigured] = useState(true)

    const loadKeys = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/api-key')
            if (!response.ok) throw new Error('failed')

            const data = await response.json()
            setKeys(data.keys ?? [])
            setEncryptionConfigured(data.encryptionConfigured !== false)
        } catch {
            toast.error('Falha ao carregar as chaves')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadKeys()
    }, [loadKeys])

    const saveKey = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const response = await fetch('/api/settings/api-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ provider, apiKey }),
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                // Show the server's specific reason when it has one — a bare
                // "failed to save" leaves the user with nowhere to go.
                toast.error(data?.error || 'Falha ao guardar a chave', { duration: 8000 })
                if (data?.details) console.error('[API Key]', data.details)
                return
            }

            toast.success('Chave validada e guardada')
            // Clear immediately: there is no reason for the plaintext key to
            // stay in the DOM once it has been accepted.
            setApiKey('')
            await loadKeys()
        } catch {
            toast.error('Falha ao guardar a chave')
        } finally {
            setSaving(false)
        }
    }

    const deleteKey = async (target: Provider) => {
        try {
            const response = await fetch(`/api/settings/api-key?provider=${target}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                const data = await response.json().catch(() => null)
                toast.error(data?.error || 'Falha ao remover a chave')
                return
            }

            toast.success('Chave removida')
            await loadKeys()
        } catch {
            toast.error('Falha ao remover a chave')
        }
    }

    return (
        <div className="rounded-lg border bg-card p-6">
            <div className="mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <KeyRound className="h-5 w-5" />
                    Chave de API para Classificação
                </h2>
                <p className="text-sm text-muted-foreground">
                    Use a sua própria chave para classificar documentos. Os custos ficam na sua conta
                    do fornecedor e a chave é guardada encriptada.
                </p>
            </div>

            {!encryptionConfigured && (
                <div className="mb-4 flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                    <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <span>
                        A encriptação não está configurada no servidor (ENCRYPTION_KEY em falta).
                        Não é possível guardar chaves até que seja definida.
                    </span>
                </div>
            )}

            <div className="space-y-5">
                {loading ? (
                    <p className="text-sm text-muted-foreground">A carregar...</p>
                ) : keys.length > 0 ? (
                    <div className="space-y-2">
                        {keys.map((stored) => (
                            <div
                                key={stored.id}
                                className="flex items-center justify-between gap-3 rounded-lg border p-3"
                            >
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-medium">
                                            {PROVIDER_LABELS[stored.provider].label}
                                        </span>
                                        <Badge variant={stored.status === 'valid' ? 'success' : 'destructive'}>
                                            {stored.status === 'valid' ? 'Válida' : 'Inválida'}
                                        </Badge>
                                    </div>
                                    <code className="text-xs text-muted-foreground">{stored.key_hint}</code>
                                </div>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => deleteKey(stored.provider)}
                                    className="gap-1 text-destructive hover:text-destructive"
                                >
                                    <Trash2 className="h-3 w-3" />
                                    Remover
                                </Button>
                            </div>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        Nenhuma chave configurada. Sem chave, a classificação continua a usar o
                        webhook configurado.
                    </p>
                )}

                <form onSubmit={saveKey} className="space-y-3">
                    <div>
                        <Label htmlFor="provider">Fornecedor</Label>
                        <select
                            id="provider"
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as Provider)}
                            className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            disabled={saving || !encryptionConfigured}
                        >
                            {(Object.keys(PROVIDER_LABELS) as Provider[]).map((id) => (
                                <option key={id} value={id}>
                                    {PROVIDER_LABELS[id].label}
                                </option>
                            ))}
                        </select>
                    </div>

                    <div>
                        <Label htmlFor="apiKey">Chave</Label>
                        <Input
                            id="apiKey"
                            type="password"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder={PROVIDER_LABELS[provider].placeholder}
                            className="mt-1 font-mono"
                            autoComplete="off"
                            disabled={saving || !encryptionConfigured}
                            required
                        />
                        <p className="mt-1 text-sm text-muted-foreground">
                            Obtenha uma chave em{' '}
                            <a
                                href={PROVIDER_LABELS[provider].console}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                            >
                                {PROVIDER_LABELS[provider].console.replace('https://', '')}
                            </a>
                            . A chave é validada antes de ser guardada e nunca é devolvida ao
                            navegador depois disso.
                        </p>
                    </div>

                    <Button type="submit" disabled={saving || !apiKey || !encryptionConfigured}>
                        {saving ? 'A validar...' : 'Validar e guardar'}
                    </Button>
                </form>
            </div>
        </div>
    )
}
