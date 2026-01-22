import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/debug/documents
 * Debug endpoint to check document classifications
 */
export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all documents with classification info
    const { data: documents, error } = await supabase
      .from('documents')
      .select('id, filename, document_type, original_classification, final_classification, status, webhook_processed_at, webhook_error, invoice_number, supplier_name, processed_at')
      .eq('user_id', user.id)
      .order('processed_at', { ascending: false })
      .limit(10)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      count: documents?.length || 0,
      documents: documents || [],
    })
  } catch (error) {
    console.error('Debug documents error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch documents',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
