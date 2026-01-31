import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST() {
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options)
                        })
                    },
                },
            }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Check if demo invoice already exists
        const { data: existingDemo } = await supabase
            .from('documents')
            .select('id')
            .eq('user_id', user.id)
            .eq('is_demo', true)
            .single()

        if (existingDemo) {
            return NextResponse.json({
                success: true,
                message: 'Demo invoice already exists',
                document_id: existingDemo.id
            })
        }

        // Get or create a dummy gmail account for the demo invoice
        let gmailAccountId: string

        const { data: gmailAccount } = await supabase
            .from('gmail_accounts')
            .select('id')
            .eq('user_id', user.id)
            .single()

        if (gmailAccount) {
            gmailAccountId = gmailAccount.id
        } else {
            // Create a placeholder gmail account for demo purposes
            const { data: newAccount, error: accountError } = await supabase
                .from('gmail_accounts')
                .insert({
                    user_id: user.id,
                    email: user.email || 'demo@example.com',
                    access_token: 'demo_token',
                    refresh_token: 'demo_refresh',
                    token_expiry: new Date(Date.now() + 3600000).toISOString(),
                    is_primary: true
                })
                .select('id')
                .single()

            if (accountError || !newAccount) {
                console.error('Error creating demo gmail account:', accountError)
                return NextResponse.json({ error: 'Failed to create demo account' }, { status: 500 })
            }

            gmailAccountId = newAccount.id
        }

        // Create demo invoice
        const demoInvoice = {
            user_id: user.id,
            gmail_account_id: gmailAccountId,
            email_message_id: `demo_${user.id}_${Date.now()}`,
            file_hash: `demo_hash_${Date.now()}`,
            subject: 'Fatura DEMO-2026/001 - Demo Supplier Lda',
            sender: 'contabilidade@demosupplier.pt',
            sender_domain: 'demosupplier.pt',
            received_date: new Date().toISOString(),
            filename: 'DEMO-2026-001.pdf',
            original_classification: 'invoice',
            final_classification: 'invoice',
            confidence_score: 0.95,
            was_reclassified: false,
            status: 'pending',
            is_demo: true,
            supplier_name: 'Demo Supplier Lda',
            invoice_number: 'DEMO-2026/001',
            invoice_total: 1234.56,
            currency: 'EUR',
            invoice_date: new Date().toISOString().split('T')[0],
            processed_at: new Date().toISOString()
        }

        const { data: createdInvoice, error: invoiceError } = await supabase
            .from('documents')
            .insert(demoInvoice)
            .select('id')
            .single()

        if (invoiceError) {
            console.error('Error creating demo invoice:', invoiceError)
            return NextResponse.json({ error: 'Failed to create demo invoice' }, { status: 500 })
        }

        // Update profile to mark demo invoice as created
        await supabase
            .from('profiles')
            .update({
                demo_invoice_created: true,
                updated_at: new Date().toISOString()
            })
            .eq('id', user.id)

        return NextResponse.json({
            success: true,
            document_id: createdInvoice.id
        })
    } catch (error) {
        console.error('Error creating demo invoice:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
