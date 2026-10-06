import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { nanoid } from 'nanoid'

export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = await createClient()

        // Create a fake invoice record
        const fakeInvoice = {
            user_id: user.id,
            email_message_id: `demo_${nanoid()}`,
            file_hash: `demo_hash_${nanoid()}`,
            filename: 'fatura-casadamoeda.pdf',
            subject: 'Fatura Casa da Moeda',
            sender: 'contacto@casadamoeda.com',
            sender_domain: 'casadamoeda.com',
            received_date: new Date().toISOString(),
            status: 'pending' as const,
            source: 'gmail' as const, // Corrected source
            confidence_score: 1.0,

            // Required DB Fields
            original_classification: 'invoice' as const,
            final_classification: 'invoice' as const,

            // Extracted Data per User Request
            // Note: These flat columns match the schema inferred from success
            invoice_number: 'FR/123456789',
            supplier_name: 'Casa da Moeda Lda',
            invoice_total: 100.00,
            total_vat: 23.00,
            total_without_vat: 77.00,
            currency: 'EUR',
            issue_date: new Date().toISOString().split('T')[0],
            // extract_data removed as it does not exist
        }

        const { data, error } = await supabase
            .from('documents')
            .insert(fakeInvoice)
            .select()
            .single()

        if (error) {
            console.error('Seeding error', error)
            return NextResponse.json({ error: 'Failed to seed data' }, { status: 500 })
        }

        return NextResponse.json({ success: true, document: data })

    } catch (error: any) {
        console.error('Seed route fatal:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
