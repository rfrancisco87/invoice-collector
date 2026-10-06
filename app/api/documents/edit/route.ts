import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

/**
 * Manual override for extracted invoice fields.
 *
 * The n8n webhook gets most documents right, but struggles with edge cases
 * like promo-discounted receipts where Subtotal and Total diverge. This
 * endpoint lets the user correct the fields that matter for the approved
 * filename template + bookkeeping before approving the doc.
 *
 * Only these fields are editable — everything else (file_hash, dates,
 * source, status) is either derived or part of the audit trail and must
 * not drift from reality. Classification has its own endpoint already
 * (/api/documents/reclassify).
 */
const EDITABLE_FIELDS = [
    'supplier_name',
    'supplier_vat_number',
    'invoice_number',
    'issue_date',
    'total_without_vat',
    'total_vat',
    'invoice_total',
    'currency',
] as const

type EditableField = (typeof EDITABLE_FIELDS)[number]

function normaliseValue(field: EditableField, raw: unknown): unknown {
    if (raw === '' || raw === null || raw === undefined) return null

    if (field === 'total_without_vat' || field === 'total_vat' || field === 'invoice_total') {
        const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(',', '.'))
        return Number.isFinite(n) ? n : null
    }

    return String(raw).trim() || null
}

export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const { documentId, fields } = await request.json()
        if (!documentId || !fields || typeof fields !== 'object') {
            return NextResponse.json({ error: 'Invalid request' }, { status: 400 })
        }

        const update: Record<string, unknown> = {}
        for (const key of EDITABLE_FIELDS) {
            if (key in fields) {
                update[key] = normaliseValue(key, fields[key])
            }
        }

        if (Object.keys(update).length === 0) {
            return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 })
        }

        const supabase = await createClient()

        const { error } = await supabase
            .from('documents')
            // @ts-ignore - Supabase row types infer as never across this project
            .update(update)
            .eq('id', documentId)
            .eq('user_id', user.id)

        if (error) {
            console.error('[Documents Edit] Update failed:', error)
            return NextResponse.json({ error: 'Failed to update document' }, { status: 500 })
        }

        return NextResponse.json({ success: true })
    } catch (error) {
        console.error('Edit error:', error)
        return NextResponse.json(
            { error: 'Failed to edit document' },
            { status: 500 },
        )
    }
}
