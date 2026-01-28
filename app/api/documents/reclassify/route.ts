import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { documentId, classification } = body

    if (!documentId || !classification || !['invoice', 'credit_note', 'unclassified'].includes(classification)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Get document
    // @ts-ignore - TypeScript has issues with Supabase types
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', documentId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Update classification
    // @ts-ignore
    await supabase
      .from('documents')
      // @ts-ignore
      .update({
        final_classification: classification,
        was_reclassified: true,
      })
      .eq('id', documentId)

    // Record feedback
    // @ts-ignore
    await supabase.from('user_feedback').insert({
      user_id: user.id,
      document_id: documentId,
      action: 'reclassified' as const,
      // @ts-ignore
      original_classification: document.original_classification,
      new_classification: classification,
      // @ts-ignore
      sender_domain: document.sender_domain,
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Reclassify error:', error)
    return NextResponse.json(
      { error: 'Failed to reclassify document' },
      { status: 500 }
    )
  }
}
