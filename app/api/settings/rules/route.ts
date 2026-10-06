import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { validatePattern } from '@/lib/classifier/rules'

/**
 * User-defined classification rules.
 *
 * The important validation here is on `filename_regex`: the stored pattern is
 * later executed server-side against every incoming document, so a
 * catastrophically-backtracking pattern would hang the sync sweep. It is
 * rejected at save time, where the user can still see and fix it.
 */

const STAGES = ['pre_filter', 'prompt_hint', 'post_decision'] as const
const MATCH_TYPES = [
    'sender_domain',
    'sender_email',
    'filename_regex',
    'subject_keyword',
    'nl_instruction',
] as const
const ACTIONS = [
    'skip',
    'force_invoice',
    'force_not_invoice',
    'require_review',
    'hint',
] as const

interface RulePayload {
    name?: unknown
    stage?: unknown
    match_type?: unknown
    match_value?: unknown
    action?: unknown
    priority?: unknown
    enabled?: unknown
}

function validateRule(body: RulePayload): { ok: true; rule: any } | { ok: false; error: string } {
    const name = typeof body.name === 'string' ? body.name.trim() : ''
    if (!name || name.length > 100) {
        return { ok: false, error: 'O nome da regra é obrigatório (máx. 100 caracteres).' }
    }

    if (!STAGES.includes(body.stage as any)) {
        return { ok: false, error: 'Fase inválida.' }
    }

    if (!MATCH_TYPES.includes(body.match_type as any)) {
        return { ok: false, error: 'Tipo de correspondência inválido.' }
    }

    if (!ACTIONS.includes(body.action as any)) {
        return { ok: false, error: 'Ação inválida.' }
    }

    const matchValue = typeof body.match_value === 'string' ? body.match_value.trim() : ''
    if (!matchValue || matchValue.length > 500) {
        return { ok: false, error: 'O valor da regra é obrigatório (máx. 500 caracteres).' }
    }

    // Regexes are the only user input here that gets executed later.
    if (body.match_type === 'filename_regex') {
        const validation = validatePattern(matchValue)
        if (!validation.ok) {
            return { ok: false, error: validation.error ?? 'Padrão inválido.' }
        }
    }

    // A natural-language instruction is only consulted when building the prompt,
    // so pairing it with any other stage would create a rule that silently never
    // does anything.
    if (body.match_type === 'nl_instruction' && body.stage !== 'prompt_hint') {
        return {
            ok: false,
            error: 'Instruções em texto livre só podem ser usadas na fase "prompt_hint".',
        }
    }

    if (body.stage === 'prompt_hint' && body.match_type !== 'nl_instruction') {
        return {
            ok: false,
            error: 'A fase "prompt_hint" requer uma instrução em texto livre.',
        }
    }

    const priority = Number(body.priority ?? 100)
    if (!Number.isFinite(priority) || priority < 0 || priority > 10_000) {
        return { ok: false, error: 'Prioridade inválida.' }
    }

    return {
        ok: true,
        rule: {
            name,
            stage: body.stage,
            match_type: body.match_type,
            match_value: matchValue,
            action: body.action,
            priority: Math.round(priority),
            enabled: body.enabled === undefined ? true : !!body.enabled,
        },
    }
}

export async function GET() {
    try {
        const user = await requireApiUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const supabase = await createClient()

        const { data, error } = await supabase
            .from('classification_rules')
            .select('*')
            .eq('user_id', user.id)
            .order('priority', { ascending: true })
            .order('created_at', { ascending: true })

        if (error) {
            console.error('[Rules] List failed:', error)
            return NextResponse.json(
                { error: 'Falha ao carregar regras.' },
                { status: 500 }
            )
        }

        return NextResponse.json({ rules: data ?? [] })
    } catch (error) {
        console.error('[Rules] List failed:', error)
        return NextResponse.json({ error: 'Falha ao carregar regras.' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json().catch(() => ({}))
        const validation = validateRule(body)

        if (!validation.ok) {
            return NextResponse.json({ error: validation.error }, { status: 400 })
        }

        const supabase = await createClient()

        const { data, error } = await supabase
            .from('classification_rules')
            // @ts-ignore - Supabase row types infer as never across this project
            .insert({ ...validation.rule, user_id: user.id })
            .select()
            .single()

        if (error) {
            console.error('[Rules] Create failed:', error)
            return NextResponse.json(
                { error: 'Falha ao criar regra.' },
                { status: 500 }
            )
        }

        return NextResponse.json({ rule: data })
    } catch (error) {
        console.error('[Rules] Create failed:', error)
        return NextResponse.json({ error: 'Falha ao criar regra.' }, { status: 500 })
    }
}

export async function PATCH(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const body = await request.json().catch(() => ({}))
        const { id, ...rest } = body ?? {}

        if (!id) return NextResponse.json({ error: 'Missing rule id' }, { status: 400 })

        const supabase = await createClient()

        // A toggle carries only `enabled`, so it skips the full-rule validation
        // that would otherwise reject the partial payload.
        const isToggleOnly = Object.keys(rest).length === 1 && 'enabled' in rest
        const updates = isToggleOnly
            ? { enabled: !!rest.enabled }
            : (() => {
                const validation = validateRule(rest)
                return validation.ok ? validation.rule : null
            })()

        if (!updates) {
            const validation = validateRule(rest)
            return NextResponse.json(
                { error: validation.ok ? 'Dados inválidos.' : validation.error },
                { status: 400 }
            )
        }

        const { data, error } = await supabase
            .from('classification_rules')
            // @ts-ignore - Supabase row types infer as never across this project
            .update(updates)
            .eq('id', id)
            .eq('user_id', user.id)
            .select()

        if (error) {
            console.error('[Rules] Update failed:', error)
            return NextResponse.json(
                { error: 'Falha ao atualizar regra.' },
                { status: 500 }
            )
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ error: 'Regra não encontrada.' }, { status: 404 })
        }

        return NextResponse.json({ rule: data[0] })
    } catch (error) {
        console.error('[Rules] Update failed:', error)
        return NextResponse.json({ error: 'Falha ao atualizar regra.' }, { status: 500 })
    }
}

export async function DELETE(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

        const { searchParams } = new URL(request.url)
        const id = searchParams.get('id')

        if (!id) return NextResponse.json({ error: 'Missing rule id' }, { status: 400 })

        const supabase = await createClient()

        const { error } = await supabase
            .from('classification_rules')
            .delete()
            .eq('id', id)
            .eq('user_id', user.id)

        if (error) {
            console.error('[Rules] Delete failed:', error)
            return NextResponse.json(
                { error: 'Falha ao remover regra.' },
                { status: 500 }
            )
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('[Rules] Delete failed:', error)
        return NextResponse.json({ error: 'Falha ao remover regra.' }, { status: 500 })
    }
}
