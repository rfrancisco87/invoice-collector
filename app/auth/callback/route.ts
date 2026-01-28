import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const origin = requestUrl.origin

  if (code) {
    const supabase = await createClient()

    const { data: { session }, error } = await supabase.auth.exchangeCodeForSession(code)

    if (error) {
      return NextResponse.redirect(`${origin}/login?error=auth_failed`)
    }

    if (session) {
      // Store Google OAuth tokens in gmail_accounts table
      const providerToken = session.provider_token
      const providerRefreshToken = session.provider_refresh_token

      if (providerToken && providerRefreshToken) {
        const { data: existingAccount } = await supabase
          .from('gmail_accounts')
          .select('id')
          .eq('user_id', session.user.id)
          .single()

        const tokenExpiry = new Date()
        tokenExpiry.setHours(tokenExpiry.getHours() + 1) // Google tokens typically expire in 1 hour

        if (existingAccount) {
          // Update existing account
          await supabase
            .from('gmail_accounts')
            .update({
              access_token: providerToken,
              refresh_token: providerRefreshToken,
              token_expiry: tokenExpiry.toISOString(),
              email: session.user.email || '',
            })
            .eq('user_id', session.user.id)
        } else {
          // Create new account
          await supabase
            .from('gmail_accounts')
            .insert({
              user_id: session.user.id,
              email: session.user.email || '',
              access_token: providerToken,
              refresh_token: providerRefreshToken,
              token_expiry: tokenExpiry.toISOString(),
              is_primary: true,
            })
        }

        // Check if user has settings, if not create default settings
        const { data: settings } = await supabase
          .from('user_settings')
          .select('id')
          .eq('user_id', session.user.id)
          .single()

        if (!settings) {
          await supabase
            .from('user_settings')
            .insert({
              user_id: session.user.id,
              sync_days_back: 1,
            })
        }
      }

      // Check if user has Drive folder configured
      const { data: userSettings } = await supabase
        .from('user_settings')
        .select('drive_folder_id')
        .eq('user_id', session.user.id)
        .single()

      if (!userSettings?.drive_folder_id) {
        // Redirect to setup if no Drive folder configured
        return NextResponse.redirect(`${origin}/setup`)
      }

      // Redirect to dashboard if everything is set up
      return NextResponse.redirect(`${origin}/dashboard`)
    }
  }

  // If no code or session, redirect to login
  return NextResponse.redirect(`${origin}/login?error=no_code`)
}
