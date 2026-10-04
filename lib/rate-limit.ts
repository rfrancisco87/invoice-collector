import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * Rate limiting for the unauthenticated auth endpoints.
 *
 * Backed by the hit_rate_limit() RPC (migration 029) rather than memory: on
 * Vercel each serverless instance has its own memory and loses it on cold
 * start, so an in-process counter would barely slow an attacker down.
 */

export type RateLimitRule = {
  /** Namespaced counter key, e.g. `login:ip:1.2.3.4`. */
  key: string
  windowSeconds: number
  max: number
}

/**
 * Client IP as seen by the platform. On Vercel the first x-forwarded-for hop
 * is the real client (the edge overwrites the header), so it is not
 * client-spoofable there. Falls back to a shared bucket rather than skipping
 * the limit when no IP is available.
 */
export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const first = forwarded?.split(',')[0]?.trim()
  if (first) return first

  const realIp = request.headers.get('x-real-ip')?.trim()
  if (realIp) return realIp

  return 'unknown'
}

/**
 * Record one hit against every rule. Returns true if any rule is now over its
 * limit.
 *
 * All rules are hit (not short-circuited) so that each counter reflects the
 * real request volume. Fails open: if the database call errors, the request
 * is allowed and the error logged — a DB hiccup should not lock every user
 * out of the app.
 */
export async function isRateLimited(rules: RateLimitRule[]): Promise<boolean> {
  try {
    const supabase = createAdminClient()

    const results = await Promise.all(
      rules.map(async (rule) => {
        const { data, error } = await (supabase as any).rpc('hit_rate_limit', {
          p_key: rule.key,
          p_window_seconds: rule.windowSeconds,
          p_max: rule.max,
        })

        if (error) {
          console.error('[Rate Limit] RPC failed, allowing request:', rule.key, error)
          return false
        }

        return data === true
      })
    )

    return results.some(Boolean)
  } catch (error) {
    console.error('[Rate Limit] Check failed, allowing request:', error)
    return false
  }
}

/** Generic 429. Deliberately says nothing about which limit was hit. */
export function rateLimitResponse() {
  return NextResponse.json(
    { error: 'Demasiadas tentativas. Tente novamente mais tarde.' },
    { status: 429 }
  )
}
