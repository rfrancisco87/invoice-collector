'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Filter, Plus, Trash2 } from 'lucide-react'

type Stage = 'pre_filter' | 'prompt_hint' | 'post_decision'
type MatchType =
    | 'sender_domain'
    | 'sender_email'
    | 'filename_regex'
    | 'subject_keyword'
    | 'nl_instruction'
type Action = 'skip' | 'force_invoice' | 'force_not_invoice' | 'require_review' | 'hint'

interface Rule {
    id: string
    name: string
    enabled: boolean
    priority: number
    stage: Stage
    match_type: MatchType
    match_value: string
    action: Action
}

const STAGE_LABELS: Record<Stage, string> = {
    pre_filter: 'Antes de processar',
    prompt_hint: 'Instrução ao modelo',
    post_decision: 'Depois de classificar',
}

const MATCH_LABELS: Record<MatchType, string> = {
    sender_domain: 'Domínio do remetente',
    sender_email: 'Email do remetente',
    filename_regex: 'Nome do ficheiro (regex)',
    subject_keyword: 'Palavra no assunto',
    nl_instruction: 'Instrução em texto livre',
}

const ACTION_LABELS: Record<Action, string> = {
    skip: 'Ignorar documento',
    force_invoice: 'Tratar como fatura',
    force_not_invoice: 'Tratar como não-fatura',
    require_review: 'Marcar para revisão',
    hint: 'Apenas sugestão',
}

/** Which match types and actions make sense for each stage. */
const STAGE_OPTIONS: Record<Stage, { matches: MatchType[]; actions: Action[] }> = {
    pre_filter: {
        matches: ['sender_domain', 'sender_email', 'filename_regex', 'subject_keyword'],
        actions: ['skip', 'force_invoice', 'require_review'],
    },
    prompt_hint: {
        matches: ['nl_instruction'],
        actions: ['hint'],
    },
    post_decision: {
        matches: ['sender_domain', 'sender_email', 'filename_regex', 'subject_keyword'],
        actions: ['force_invoice', 'force_not_invoice', 'require_review'],
    },
}

const EMPTY_DRAFT = {
    name: '',
    stage: 'pre_filter' as Stage,
    match_type: 'sender_domain' as MatchType,
    match_value: '',
    action: 'skip' as Action,
    priority: 100,
}

export function RulesManager() {
    const [rules, setRules] = useState<Rule[]>([])
    const [draft, setDraft] = useState(EMPTY_DRAFT)
    const [loading, setLoading] = useState(true)
    const [saving, setSaving] = useState(false)

    const loadRules = useCallback(async () => {
        try {
            const response = await fetch('/api/settings/rules')
            if (!response.ok) throw new Error('failed')
            const data = await response.json()
            setRules(data.rules ?? [])
        } catch {
            toast.error('Falha ao carregar regras')
        } finally {
            setLoading(false)
        }
    }, [])

    useEffect(() => {
        loadRules()
    }, [loadRules])

    // Changing stage can leave the match type or action invalid for it, so both
    // snap to the first legal option rather than silently submitting a
    // combination the server will reject.
    const changeStage = (stage: Stage) => {
        const options = STAGE_OPTIONS[stage]
        setDraft((current) => ({
            ...current,
            stage,
            match_type: options.matches.includes(current.match_type)
                ? current.match_type
                : options.matches[0],
            action: options.actions.includes(current.action) ? current.action : options.actions[0],
        }))
    }

    const createRule = async (e: React.FormEvent) => {
        e.preventDefault()
        setSaving(true)

        try {
            const response = await fetch('/api/settings/rules', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(draft),
            })

            const data = await response.json().catch(() => null)

            if (!response.ok) {
                toast.error(data?.error || 'Falha ao criar regra', { duration: 8000 })
                return
            }

            toast.success('Regra criada')
            setDraft(EMPTY_DRAFT)
            await loadRules()
        } catch {
            toast.error('Falha ao criar regra')
        } finally {
            setSaving(false)
        }
    }

    const toggleRule = async (rule: Rule) => {
        try {
            const response = await fetch('/api/settings/rules', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: rule.id, enabled: !rule.enabled }),
            })

            if (!response.ok) {
                toast.error('Falha ao atualizar regra')
                return
            }

            await loadRules()
        } catch {
            toast.error('Falha ao atualizar regra')
        }
    }

    const deleteRule = async (id: string) => {
        try {
            const response = await fetch(`/api/settings/rules?id=${encodeURIComponent(id)}`, {
                method: 'DELETE',
            })

            if (!response.ok) {
                toast.error('Falha ao remover regra')
                return
            }

            toast.success('Regra removida')
            await loadRules()
        } catch {
            toast.error('Falha ao remover regra')
        }
    }

    const options = STAGE_OPTIONS[draft.stage]

    return (
        <div className="rounded-lg border bg-card p-6">
            <div className="mb-4">
                <h2 className="flex items-center gap-2 text-lg font-semibold text-foreground">
                    <Filter className="h-5 w-5" />
                    Regras de Classificação
                </h2>
                <p className="text-sm text-muted-foreground">
                    Ensine o sistema sobre o seu próprio correio. As regras com prioridade mais
                    baixa são avaliadas primeiro e a primeira que corresponder decide.
                </p>
            </div>

            <div className="space-y-6">
                {loading ? (
                    <p className="text-sm text-muted-foreground">A carregar...</p>
                ) : rules.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                        Sem regras. O sistema usa apenas o comportamento predefinido.
                    </p>
                ) : (
                    <div className="space-y-2">
                        {rules.map((rule) => (
                            <div
                                key={rule.id}
                                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
                            >
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-sm font-medium">{rule.name}</span>
                                        <Badge variant="outline" className="text-xs">
                                            {STAGE_LABELS[rule.stage]}
                                        </Badge>
                                        <Badge variant="secondary" className="text-xs">
                                            {ACTION_LABELS[rule.action]}
                                        </Badge>
                                        {!rule.enabled && (
                                            <Badge variant="outline" className="text-xs">
                                                Desativada
                                            </Badge>
                                        )}
                                    </div>
                                    <p className="mt-1 truncate text-xs text-muted-foreground">
                                        {MATCH_LABELS[rule.match_type]}:{' '}
                                        <code className="font-mono">{rule.match_value}</code>
                                        {' · prioridade '}
                                        {rule.priority}
                                    </p>
                                </div>

                                <div className="flex flex-shrink-0 items-center gap-2">
                                    <Button variant="outline" size="sm" onClick={() => toggleRule(rule)}>
                                        {rule.enabled ? 'Desativar' : 'Ativar'}
                                    </Button>
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => deleteRule(rule.id)}
                                        className="gap-1 text-destructive hover:text-destructive"
                                    >
                                        <Trash2 className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <form onSubmit={createRule} className="space-y-3 border-t pt-4">
                    <p className="text-sm font-medium text-foreground">Nova regra</p>

                    <div>
                        <Label htmlFor="rule_name">Nome</Label>
                        <Input
                            id="rule_name"
                            value={draft.name}
                            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                            placeholder="Ignorar extratos do banco X"
                            className="mt-1"
                            required
                            disabled={saving}
                        />
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                            <Label htmlFor="rule_stage">Quando aplicar</Label>
                            <select
                                id="rule_stage"
                                value={draft.stage}
                                onChange={(e) => changeStage(e.target.value as Stage)}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                disabled={saving}
                            >
                                {(Object.keys(STAGE_LABELS) as Stage[]).map((stage) => (
                                    <option key={stage} value={stage}>
                                        {STAGE_LABELS[stage]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <Label htmlFor="rule_action">Ação</Label>
                            <select
                                id="rule_action"
                                value={draft.action}
                                onChange={(e) => setDraft({ ...draft, action: e.target.value as Action })}
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                disabled={saving}
                            >
                                {options.actions.map((action) => (
                                    <option key={action} value={action}>
                                        {ACTION_LABELS[action]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <Label htmlFor="rule_match_type">Corresponder por</Label>
                            <select
                                id="rule_match_type"
                                value={draft.match_type}
                                onChange={(e) =>
                                    setDraft({ ...draft, match_type: e.target.value as MatchType })
                                }
                                className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                disabled={saving}
                            >
                                {options.matches.map((match) => (
                                    <option key={match} value={match}>
                                        {MATCH_LABELS[match]}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <Label htmlFor="rule_priority">Prioridade</Label>
                            <Input
                                id="rule_priority"
                                type="number"
                                min={0}
                                max={10000}
                                value={draft.priority}
                                onChange={(e) =>
                                    setDraft({ ...draft, priority: Number(e.target.value) })
                                }
                                className="mt-1"
                                disabled={saving}
                            />
                        </div>
                    </div>

                    <div>
                        <Label htmlFor="rule_value">
                            {draft.match_type === 'nl_instruction' ? 'Instrução' : 'Valor'}
                        </Label>
                        <Input
                            id="rule_value"
                            value={draft.match_value}
                            onChange={(e) => setDraft({ ...draft, match_value: e.target.value })}
                            placeholder={
                                draft.match_type === 'nl_instruction'
                                    ? 'Documentos do meu contabilista nunca são faturas'
                                    : draft.match_type === 'filename_regex'
                                        ? '^Extrato_\\d{4}'
                                        : 'exemplo.com'
                            }
                            className="mt-1 font-mono"
                            required
                            disabled={saving}
                        />
                        {draft.match_type === 'filename_regex' && (
                            <p className="mt-1 text-xs text-muted-foreground">
                                Expressão regular. Padrões com quantificadores aninhados (ex.
                                &quot;(a+)+&quot;) são rejeitados por motivos de desempenho.
                            </p>
                        )}
                    </div>

                    <Button type="submit" disabled={saving} className="gap-2">
                        <Plus className="h-4 w-4" />
                        {saving ? 'A criar...' : 'Criar regra'}
                    </Button>
                </form>
            </div>
        </div>
    )
}
