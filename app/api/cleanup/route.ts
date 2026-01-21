import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()

    // Get current session
    const { data: { session } } = await supabase.auth.getSession()

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const user = session.user

    // Delete all user data in order (respecting foreign key constraints)
    const results = {
      userFeedback: 0,
      senderReputation: 0,
      documents: 0,
      syncJobs: 0,
    }

    // Delete user_feedback
    const { error: feedbackError, count: feedbackCount } = await supabase
      .from('user_feedback')
      .delete()
      .eq('user_id', user.id)

    if (feedbackError) {
      console.error('Error deleting user_feedback:', feedbackError)
    } else {
      results.userFeedback = feedbackCount || 0
    }

    // Delete sender_reputation
    const { error: reputationError, count: reputationCount } = await supabase
      .from('sender_reputation')
      .delete()
      .eq('user_id', user.id)

    if (reputationError) {
      console.error('Error deleting sender_reputation:', reputationError)
    } else {
      results.senderReputation = reputationCount || 0
    }

    // Delete documents
    const { error: documentsError, count: documentsCount } = await supabase
      .from('documents')
      .delete()
      .eq('user_id', user.id)

    if (documentsError) {
      console.error('Error deleting documents:', documentsError)
    } else {
      results.documents = documentsCount || 0
    }

    // Delete sync_jobs
    const { error: syncJobsError, count: syncJobsCount } = await supabase
      .from('sync_jobs')
      .delete()
      .eq('user_id', user.id)

    if (syncJobsError) {
      console.error('Error deleting sync_jobs:', syncJobsError)
    } else {
      results.syncJobs = syncJobsCount || 0
    }

    return NextResponse.json({
      success: true,
      message: 'Database cleaned successfully',
      results,
    })
  } catch (error) {
    console.error('Cleanup error:', error)
    return NextResponse.json(
      {
        error: 'Failed to clean database',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
