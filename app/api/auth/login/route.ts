import { NextResponse } from 'next/server'
import { applyLoginSession } from '@/lib/auth'
import { verifyPassword } from '@/lib/password'
import { createAdminClient } from '@/lib/supabase/admin'

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

    const { data: profile } = await supabase
      .from('profiles')
      .select('id, email')
      .eq('email', normalizedEmail)
      .single()

    if (!profile) {
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
