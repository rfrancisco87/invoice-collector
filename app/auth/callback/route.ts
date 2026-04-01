import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isAllowedOwnerEmail } from '@/lib/auth-config'

/**
 * Auth Callback Handler
 *
 * Handles OAuth callback for user authentication (login/signup).
 * Note: Gmail connection is now separate - see /api/gmail/callback
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirect = requestUrl.searchParams.get('redirect')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      console.error('[Auth Callback] Error exchanging code:', error)
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    if (session) {
      if (!isAllowedOwnerEmail(session.user.email)) {
        await supabase.auth.signOut()
        return NextResponse.redirect(`${origin}/login?error=unauthorized_user`)
      }

      // Ensure user has settings (profile is created via trigger)
      const { data: settings } = await supabase
        .from('user_settings')
        .select('id')
        .eq('user_id', session.user.id)
        .single()

      if (!settings) {
        // Create default settings for new user
        await supabase
          .from('user_settings')
          .insert({
            user_id: session.user.id,
            sync_days_back: 1,
            auto_sync_enabled: true,
            email_notifications_enabled: true,
          })
      }

      // Redirect to specified path or dashboard
      const redirectTo = redirect || '/dashboard'
      return NextResponse.redirect(`${origin}${redirectTo}`)
    }
  }

  // If no code or session, redirect to login
  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
