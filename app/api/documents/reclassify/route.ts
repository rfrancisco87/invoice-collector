import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { scoped } from '@/lib/supabase/scoped'

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const db = scoped(supabase, user.id)

    const body = await request.json()
    const { documentId, classification } = body

    if (!documentId || !classification || !['invoice', 'credit_note', 'unclassified'].includes(classification)) {
      return NextResponse.json(
        { error: 'Invalid request' },
        { status: 400 }
      )
    }

    // Get document
    const { data: document, error: docError } = await db
      .select('documents')
      .eq('id', documentId)
      .maybeSingle()

    if (docError || !document) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 })
    }

    // Update classification
    await db
      .update('documents', {
        final_classification: classification,
        was_reclassified: true,
      })
      .eq('id', documentId)

    // Record feedback
    await db.insert('user_feedback', {
      document_id: documentId,
      action: 'reclassified' as const,
      original_classification: document.original_classification,
      new_classification: classification,
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
