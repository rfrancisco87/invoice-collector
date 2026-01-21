import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendTestEmail } from '@/lib/email'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error || !settings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const {
      sync_days_back,
      auto_sync_enabled,
      email_notifications_enabled,
      notification_email,
    } = body

    const updates: any = {}

    if (sync_days_back !== undefined) updates.sync_days_back = sync_days_back
    if (auto_sync_enabled !== undefined) updates.auto_sync_enabled = auto_sync_enabled
    if (email_notifications_enabled !== undefined) updates.email_notifications_enabled = email_notifications_enabled
    if (notification_email !== undefined) updates.notification_email = notification_email

    const { data: settings, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: 'Failed to update settings', details: error.message }, { status: 500 })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to update settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { action } = await request.json()

    if (action === 'test_email') {
      const { data: settings } = await supabase
        .from('user_settings')
        .select('notification_email')
        .eq('user_id', user.id)
        .single()

      const emailTo = settings?.notification_email || user.email

      if (!emailTo) {
        return NextResponse.json({ error: 'No email address configured' }, { status: 400 })
      }

      await sendTestEmail(emailTo)

      return NextResponse.json({ success: true, message: 'Test email sent' })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Action failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
