/**
 * Svix webhook signature verification.
 *
 * Resend signs inbound-email webhooks with Svix. Without verifying that
 * signature, /api/inbound-email is an unauthenticated write endpoint: anyone
 * who learns (or guesses) a user's inbound address can push arbitrary PDFs
 * into that user's Drive folder and document list.
 *
 * Implemented directly rather than pulling in the `svix` package — the scheme
 * is a single HMAC and the dependency surface is not worth it.
 *
 * Scheme:
 *   signed_content = `${svix-id}.${svix-timestamp}.${raw_body}`
 *   expected       = base64(HMAC_SHA256(base64decode(secret), signed_content))
 *   svix-signature = space-separated list of `v1,<base64 sig>` entries
 *                    (multiple entries appear during secret rotation)
 */

import { createHmac, timingSafeEqual } from 'crypto'

/** Reject payloads older/newer than this to blunt replay attacks. */
const TOLERANCE_SECONDS = 5 * 60

export type SignatureResult =
    | { valid: true }
    | { valid: false; reason: string }

export interface SvixHeaders {
    id: string | null
    timestamp: string | null
    signature: string | null
}

export function readSvixHeaders(headers: Headers): SvixHeaders {
    return {
        // Resend sends the `svix-*` names; `webhook-*` is the vendor-neutral
        // alias from the Standard Webhooks spec. Accept either.
        id: headers.get('svix-id') ?? headers.get('webhook-id'),
        timestamp: headers.get('svix-timestamp') ?? headers.get('webhook-timestamp'),
        signature: headers.get('svix-signature') ?? headers.get('webhook-signature'),
    }
}

/**
 * Verify a Svix-signed webhook payload.
 *
 * @param rawBody - the exact request body as text. Must not be re-serialised
 *                  from a parsed object: whitespace and key order changes break
 *                  the HMAC.
 * @param headers - the svix-id / svix-timestamp / svix-signature values
 * @param secret  - the signing secret, with or without the `whsec_` prefix
 * @param nowMs   - injectable clock, for tests
 */
export function verifySvixSignature(
    rawBody: string,
    headers: SvixHeaders,
    secret: string | undefined,
    nowMs: number = Date.now(),
): SignatureResult {
    if (!secret || !secret.trim()) {
        return { valid: false, reason: 'signing secret not configured' }
    }

    const { id, timestamp, signature } = headers

    if (!id || !timestamp || !signature) {
        return { valid: false, reason: 'missing signature headers' }
    }

    const sentAtSeconds = Number(timestamp)
    if (!Number.isFinite(sentAtSeconds)) {
        return { valid: false, reason: 'malformed timestamp' }
    }

    const driftSeconds = Math.abs(nowMs / 1000 - sentAtSeconds)
    if (driftSeconds > TOLERANCE_SECONDS) {
        return { valid: false, reason: 'timestamp outside tolerance' }
    }

    // Secrets are distributed as `whsec_<base64>`; the HMAC key is the decoded
    // base64 portion.
    const rawSecret = secret.startsWith('whsec_') ? secret.slice('whsec_'.length) : secret
    let key: Buffer
    try {
        key = Buffer.from(rawSecret, 'base64')
    } catch {
        return { valid: false, reason: 'malformed signing secret' }
    }

    if (key.length === 0) {
        return { valid: false, reason: 'malformed signing secret' }
    }

    const expected = createHmac('sha256', key)
        .update(`${id}.${timestamp}.${rawBody}`)
        .digest()

    // The header may carry several signatures during a secret rotation; any
    // one matching is a pass. Compare every candidate without short-circuiting
    // so the work is constant regardless of which entry matches.
    let matched = false
    for (const entry of signature.split(' ')) {
        const [version, value] = entry.split(',')
        if (version !== 'v1' || !value) continue

        let candidate: Buffer
        try {
            candidate = Buffer.from(value, 'base64')
        } catch {
            continue
        }

        if (candidate.length !== expected.length) continue
        if (timingSafeEqual(candidate, expected)) matched = true
    }

    return matched ? { valid: true } : { valid: false, reason: 'signature mismatch' }
}
