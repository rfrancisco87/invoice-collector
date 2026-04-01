import { createHmac, timingSafeEqual } from 'crypto'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const AUTH_COOKIE_NAME = 'invoice_collector_session'
const SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export type AppUser = {
  id: string
  email: string
  fullName: string | null
  avatarUrl: string | null
  role: string | null
}

type SessionPayload = {
  sub: string
  exp: number
}

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET

  if (!secret) {
    throw new Error('Missing APP_SESSION_SECRET')
  }

  return secret
}

function base64UrlEncode(value: string) {
  return Buffer.from(value).toString('base64url')
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, 'base64url').toString('utf8')
}

function signValue(value: string) {
  return createHmac('sha256', getSessionSecret()).update(value).digest('base64url')
}

function createSessionToken(userId: string) {
  const payload: SessionPayload = {
    sub: userId,
    exp: Date.now() + SESSION_DURATION_MS,
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = signValue(encodedPayload)

  return `${encodedPayload}.${signature}`
}

function verifySessionToken(token?: string | null): SessionPayload | null {
  if (!token) {
    return null
  }

  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  const expectedSignature = signValue(encodedPayload)
  const provided = Buffer.from(signature)
  const expected = Buffer.from(expectedSignature)

  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return null
  }

  try {
    const payload = JSON.parse(base64UrlDecode(encodedPayload)) as SessionPayload

    if (!payload.sub || !payload.exp || payload.exp < Date.now()) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

function authCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: SESSION_DURATION_MS / 1000,
  }
}

async function getUserById(userId: string): Promise<AppUser | null> {
  const supabase = createAdminClient()
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role')
    .eq('id', userId)
    .single()

  if (!profile) {
    return null
  }

  return {
    id: profile.id,
    email: profile.email,
    fullName: profile.full_name,
    avatarUrl: profile.avatar_url,
    role: profile.role,
  }
}

export async function getCurrentUser() {
  const cookieStore = await cookies()
  const token = cookieStore.get(AUTH_COOKIE_NAME)?.value
  const payload = verifySessionToken(token)

  if (!payload) {
    return null
  }

  return getUserById(payload.sub)
}

export async function requireCurrentUser(redirectTo?: string) {
  const user = await getCurrentUser()

  if (!user) {
    const loginUrl = redirectTo ? `/login?redirect=${encodeURIComponent(redirectTo)}` : '/login'
    redirect(loginUrl)
  }

  return user
}

export async function requireApiUser() {
  const user = await getCurrentUser()

  if (!user) {
    return null
  }

  return user
}

export function applyLoginSession(response: NextResponse, userId: string) {
  response.cookies.set(AUTH_COOKIE_NAME, createSessionToken(userId), authCookieOptions())
  return response
}

export function clearLoginSession(response: NextResponse) {
  response.cookies.set(AUTH_COOKIE_NAME, '', {
    ...authCookieOptions(),
    maxAge: 0,
    expires: new Date(0),
  })
  return response
}

export async function getUserFromRequest(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE_NAME)?.value
  const payload = verifySessionToken(token)

  if (!payload) {
    return null
  }

  return getUserById(payload.sub)
}
