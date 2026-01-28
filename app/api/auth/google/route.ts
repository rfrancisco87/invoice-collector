import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { GOOGLE_SCOPES } from '@/lib/constants'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const supabase = await createClient()

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${requestUrl.origin}/auth/callback`,
      scopes: GOOGLE_SCOPES,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  })

  if (error) {
    console.error('OAuth error:', error)
    return NextResponse.redirect(`${requestUrl.origin}/login?error=oauth_failed`)
  }

  if (data.url) {
    return NextResponse.redirect(data.url)
  }

  return NextResponse.redirect(`${requestUrl.origin}/login`)
}
