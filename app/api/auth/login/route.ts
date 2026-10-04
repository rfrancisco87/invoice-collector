import { NextResponse } from 'next/server'
import { applyLoginSession } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientIp, isRateLimited, rateLimitResponse } from '@/lib/rate-limit'

const WINDOW_SECONDS = 15 * 60

export async function POST(request: Request) {
  try {
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required.' },
        { status: 400 }
      )
    }

    const supabase = createAdminClient()
    const normalizedEmail = String(email).trim().toLowerCase()

    // Two limits: per IP+email stops guessing one account's password; per IP
    // alone caps spraying many accounts from one address. Checked before any
    // lookup so a limited caller learns nothing about the account.
    const ip = getClientIp(request)
    if (
      await isRateLimited([
        { key: `login:ip-email:${ip}:${normalizedEmail}`, windowSeconds: WINDOW_SECONDS, max: 10 },
        { key: `login:ip:${ip}`, windowSeconds: WINDOW_SECONDS, max: 50 },
      ])
    ) {
      return rateLimitResponse()
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email, status')
      .eq('email', normalizedEmail)
      .maybeSingle()

    if (!profile) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    // Suspended accounts keep working credentials but are refused entry, so an
    // admin can revoke access without destroying the user's documents. Checked
    // before the password comparison finishes below only in the sense of
    // ordering — the generic error message is identical either way, so this
    // does not reveal whether the address exists. Anything other than 'active'
    // (e.g. an 'invited' profile left by a direct Supabase Auth signup) is
    // refused too; getUserById would reject its session anyway.
    if ((profile as any).status !== 'active') {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    const { data: credential } = await supabase
      .from('app_credentials')
      .select('password_hash')
      .eq('profile_id', profile.id)
      .single()

    if (!credential || !verifyPassword(password, credential.password_hash)) {
      return NextResponse.json(
        { error: 'Invalid email or password.' },
        { status: 401 }
      )
    }

    return await applyLoginSession(NextResponse.json({ success: true }), profile.id)
  } catch (error) {
    console.error('[Auth Login] Failed:', error)
    return NextResponse.json({ error: 'Login failed.' }, { status: 500 })
  }
}
