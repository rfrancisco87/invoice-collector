import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { encryptToken } from '@/lib/gmail-tokens'

export async function POST() {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

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
        document_id: existingDemo.id,
      })
    }

    let gmailAccountId: string

    const { data: gmailAccount } = await supabase
      .from('gmail_accounts')
      .select('id')
      .eq('user_id', user.id)
      .single()

    if (gmailAccount) {
      gmailAccountId = gmailAccount.id
    } else {
      const { data: newAccount, error: accountError } = await supabase
        .from('gmail_accounts')
        .insert({
          user_id: user.id,
          email: user.email,
          // Placeholders, but stored like real tokens so every row has one format.
          access_token: encryptToken('demo_token'),
          refresh_token: encryptToken('demo_refresh'),
          token_expiry: new Date(Date.now() + 3600000).toISOString(),
          is_primary: true,
        })
        .select('id')
        .single()

      if (accountError || !newAccount) {
        console.error('Error creating demo gmail account:', accountError)
        return NextResponse.json({ error: 'Failed to create demo account' }, { status: 500 })
      }

      gmailAccountId = newAccount.id
    }

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
      original_classification: 'invoice' as const,
      final_classification: 'invoice' as const,
      confidence_score: 0.95,
      was_reclassified: false,
      status: 'pending' as const,
      is_demo: true,
      supplier_name: 'Demo Supplier Lda',
      invoice_number: 'DEMO-2026/001',
      invoice_total: 1234.56,
      currency: 'EUR',
      invoice_date: new Date().toISOString().split('T')[0],
      processed_at: new Date().toISOString(),
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

    await supabase
      .from('profiles')
      .update({
        demo_invoice_created: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id)

    return NextResponse.json({
      success: true,
      document_id: createdInvoice.id,
    })
  } catch (error) {
    console.error('Error creating demo invoice:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
