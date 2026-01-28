import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * GET /api/admin/settings
 * Fetch admin settings (webhook URL)
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

    // Fetch webhook URL from user_settings
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

    return NextResponse.json({
      webhook_url: settings.webhook_url || '',
    })
  } catch (error) {
    console.error('Admin settings GET error:', error)
    return NextResponse.json(
      {
        error: 'Failed to fetch settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}

/**
 * PATCH /api/admin/settings
 * Update admin settings (webhook URL)
 */
export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { webhook_url } = body

    // Validate webhook URL format (optional field, can be empty)
    if (webhook_url && typeof webhook_url !== 'string') {
      return NextResponse.json(
        { error: 'Invalid webhook URL format' },
        { status: 400 }
      )
    }

    // Basic URL validation if provided
    if (webhook_url && webhook_url.trim()) {
      try {
        new URL(webhook_url)
      } catch {
        return NextResponse.json(
          { error: 'Invalid webhook URL' },
          { status: 400 }
        )
      }
    }

    // Update user settings
    const { data: settings, error } = await supabase
      .from('user_settings')
      .update({
        webhook_url: webhook_url || null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) {
      console.error('Settings update error:', error)
      return NextResponse.json(
        { error: 'Failed to update settings', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      webhook_url: settings.webhook_url || '',
    })
  } catch (error) {
    console.error('Admin settings PATCH error:', error)
    return NextResponse.json(
      {
        error: 'Failed to update settings',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
