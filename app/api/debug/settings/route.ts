import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/debug/settings
 * Debug endpoint to check webhook configuration
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
      .select('*')
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
      webhook_url: settings?.webhook_url,
      webhook_url_exists: !!settings?.webhook_url,
      webhook_url_length: settings?.webhook_url?.length || 0,
      all_settings: settings,
    })
  } catch (error) {
    console.error('Debug settings error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
