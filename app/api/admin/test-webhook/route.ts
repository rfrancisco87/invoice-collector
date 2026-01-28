import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { testWebhookConnection } from '@/lib/webhook'

/**
 * POST /api/admin/test-webhook
 * Test webhook connectivity by sending a test PDF
 */
export async function POST() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get webhook URL from settings
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('webhook_url')
      .eq('user_id', user.id)
      .single()

    if (error || !settings) {
      return NextResponse.json(
        { error: 'Settings not found' },
        { status: 404 }
      )
    }

    const webhookUrl = settings.webhook_url

    if (!webhookUrl || !webhookUrl.trim()) {
      return NextResponse.json(
        { error: 'Webhook URL not configured' },
        { status: 400 }
      )
    }

    // Test webhook connection
    const result = await testWebhookConnection(webhookUrl)

    if (result.success) {
      return NextResponse.json({
        success: true,
        message: result.message,
      })
    } else {
      return NextResponse.json(
        {
          success: false,
          error: result.message,
        },
        { status: 500 }
      )
    }
  } catch (error) {
    console.error('Test webhook error:', error)
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to test webhook',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
