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
      gmail_sync_label,
      archive_synced_emails,
      subscription_tier,
    } = body

    const updates: any = {}

    if (sync_days_back !== undefined) updates.sync_days_back = sync_days_back
    if (auto_sync_enabled !== undefined) updates.auto_sync_enabled = auto_sync_enabled
    if (email_notifications_enabled !== undefined) updates.email_notifications_enabled = email_notifications_enabled
    if (notification_email !== undefined) updates.notification_email = notification_email
    if (gmail_sync_label !== undefined) updates.gmail_sync_label = gmail_sync_label || null
    if (archive_synced_emails !== undefined) updates.archive_synced_emails = archive_synced_emails
    if (subscription_tier !== undefined) {
      updates.subscription_tier = subscription_tier
      // Automatically set sync frequency based on subscription tier
      updates.sync_frequency_minutes = subscription_tier === 'paid' ? 15 : 720
    }

    console.log('[Settings API] Updating settings for user:', user.id)
    console.log('[Settings API] Updates:', JSON.stringify(updates, null, 2))

    const { data: settings, error } = await supabase
      .from('user_settings')
      .update(updates)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('[Settings API] Supabase error:', error)
      return NextResponse.json({
        error: 'Failed to update settings',
        details: error.message,
        code: error.code,
        hint: error.hint
      }, { status: 500 })
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
      // Check if Resend API key is configured
      if (!process.env.RESEND_API_KEY) {
        return NextResponse.json(
          {
            error: 'Resend API key not configured',
            details: 'Please restart your development server after adding RESEND_API_KEY to .env.local'
          },
          { status: 500 }
        )
      }

      const { data: settings } = await supabase
        .from('user_settings')
        .select('notification_email')
        .eq('user_id', user.id)
        .single()

      const emailTo = settings?.notification_email || user.email

      if (!emailTo) {
        return NextResponse.json({ error: 'No email address configured' }, { status: 400 })
      }

      try {
        await sendTestEmail(emailTo)
        return NextResponse.json({ success: true, message: 'Test email sent' })
      } catch (emailError) {
        const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error'

        // Check if it's a Resend validation error about email restrictions
        if (errorMessage.includes('You can only send testing emails to your own email address')) {
          return NextResponse.json(
            {
              error: 'Email restriction',
              details: 'With the free Resend plan, test emails can only be sent to the account owner\'s email. Please verify a domain at resend.com/domains to send to other addresses, or update your notification email to match your Resend account email.'
            },
            { status: 403 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to send test email', details: errorMessage },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Action failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
