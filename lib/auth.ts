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
  // profiles.session_version at issue time. Bumping the column (on suspension
  // or password change) invalidates every token carrying an older value.
  // Absent on tokens issued before the field existed; those read as 0.
  ver?: number
}

function getSessionSecret() {
  const secret = process.env.APP_SESSION_SECRET

  if (!secret) {
    throw new Error('Missing APP_SESSION_SECRET')
  }

  return secret
}

function base64UrlEncode(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
  const binary = atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))

  return new TextDecoder().decode(bytes)
}

async function importSigningKey() {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(getSessionSecret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  )
}

async function signValue(value: string) {
  const key = await importSigningKey()
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(value)
  )

  let binary = ''
  new Uint8Array(signature).forEach((byte) => {
    binary += String.fromCharCode(byte)
  })

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

async function createSessionToken(userId: string, sessionVersion: number) {
  const payload: SessionPayload = {
    sub: userId,
    exp: Date.now() + SESSION_DURATION_MS,
    ver: sessionVersion,
  }

  const encodedPayload = base64UrlEncode(JSON.stringify(payload))
  const signature = await signValue(encodedPayload)

  return `${encodedPayload}.${signature}`
}

async function verifySessionToken(token?: string | null): Promise<SessionPayload | null> {
  if (!token) {
    return null
  }

  const [encodedPayload, signature] = token.split('.')

  if (!encodedPayload || !signature) {
    return null
  }

  const key = await importSigningKey()
  const normalizedSignature = signature.replace(/-/g, '+').replace(/_/g, '/')
  const paddedSignature = normalizedSignature.padEnd(
    Math.ceil(normalizedSignature.length / 4) * 4,
    '='
  )
  const binarySignature = atob(paddedSignature)
  const signatureBytes = Uint8Array.from(binarySignature, (char) => char.charCodeAt(0))

  const isValid = await crypto.subtle.verify(
    'HMAC',
    key,
    signatureBytes,
    new TextEncoder().encode(encodedPayload)
  )

  if (!isValid) {
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

async function getUserById(userId: string, tokenVersion: number): Promise<AppUser | null> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, email, full_name, avatar_url, role, status, session_version')
    .eq('id', userId)
    .single()

  const profile = data as any

  if (!profile) {
    return null
  }

  // The cookie is only proof of a past login. Re-check on every request so a
  // suspension takes effect immediately rather than when the cookie expires.
  if (profile.status !== 'active') {
    return null
  }

  // A password reset or status change bumps session_version; tokens minted
  // before that are dead even though their signature is still valid.
  if ((profile.session_version ?? 0) !== tokenVersion) {
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
  const payload = await verifySessionToken(token)

  if (!payload) {
    return null
  }

  return getUserById(payload.sub, payload.ver ?? 0)
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

export async function applyLoginSession(response: NextResponse, userId: string) {
  // Read the version at issue time rather than taking it from the caller, so
  // every login path stamps the current value without having to know about it.
  const supabase = createAdminClient()
  const { data, error } = await supabase
    .from('profiles')
    .select('session_version')
    .eq('id', userId)
    .single()

  if (error || !data) {
    throw new Error(`Could not read session_version for ${userId}: ${error?.message ?? 'no profile'}`)
  }

  const sessionVersion = (data as any).session_version ?? 0

  response.cookies.set(
    AUTH_COOKIE_NAME,
    await createSessionToken(userId, sessionVersion),
    authCookieOptions()
  )
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
  const payload = await verifySessionToken(token)

  if (!payload) {
    return null
  }

  return getUserById(payload.sub, payload.ver ?? 0)
}
