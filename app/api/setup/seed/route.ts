import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { nanoid } from 'nanoid'

export async function POST(request: Request) {
    try {
        // 1. Get User ID from Session
        const supabase = await createClient()
        const { data: { user } } = await supabase.auth.getUser()

        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // 2. Perform Insert using Service Role (Bypassing RLS)
        const supabaseAdmin = createAdminClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                auth: {
                    persistSession: false,
                    autoRefreshToken: false,
                }
            }
        )

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
            status: 'pending',
            source: 'gmail', // Corrected source
            confidence_score: 1.0,

            // Required DB Fields
            original_classification: 'invoice',
            final_classification: 'invoice',

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

        const { data, error } = await supabaseAdmin
            .from('documents')
            .insert(fakeInvoice)
            .select()
            .single()

        if (error) {
            console.error('Seeding error', error)
            return NextResponse.json({ error: 'Failed to seed data: ' + error.message }, { status: 500 })
        }

        return NextResponse.json({ success: true, document: data })

    } catch (error: any) {
        console.error('Seed route fatal:', error)
        return NextResponse.json({ error: 'Internal Server Error: ' + error.message }, { status: 500 })
    }
}
