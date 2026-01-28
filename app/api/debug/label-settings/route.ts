import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/debug/label-settings
 * Debug endpoint to check Gmail label configuration
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

    // Fetch user settings
    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('gmail_sync_label, webhook_url')
      .eq('user_id', user.id)
      .single()

    if (error) {
      return NextResponse.json({
        error: error.message,
        details: 'Settings fetch failed',
        code: error.code
      }, { status: 500 })
    }

    return NextResponse.json({
      gmail_sync_label: settings?.gmail_sync_label,
      gmail_sync_label_exists: !!settings?.gmail_sync_label,
      gmail_sync_label_length: settings?.gmail_sync_label?.length || 0,
      gmail_sync_label_trimmed: settings?.gmail_sync_label?.trim() || '',
      webhook_url_exists: !!settings?.webhook_url,
      raw_settings: settings,
    })
  } catch (error) {
    console.error('Debug label settings error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
