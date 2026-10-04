/**
 * Google OAuth tokens at rest.
 *
 * The refresh token in gmail_accounts is a long-lived grant to the user's Gmail
 * and Drive: anyone holding it can mint access tokens until the user notices
 * and revokes the app. A database dump, a leaked backup or a stray service-role
 * key should not be enough to read every connected mailbox, so both tokens are
 * stored encrypted with the same AES-256-GCM scheme as LLM API keys
 * (lib/crypto.ts, ENCRYPTION_KEY).
 *
 * Rows written before encryption was introduced still hold plaintext. Reads
 * accept both forms so those rows keep working until
 * scripts/encrypt-gmail-tokens.ts has been run, and every refresh re-writes the
 * row encrypted, so active accounts migrate on their own.
 *
 * Rule for callers: values from the database are ciphertext. Never hand one to
 * Google (setCredentials, revoke, Drive/Gmail clients) without decryptToken —
 * or, better, use getValidGmailAccessToken, which also handles refresh.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { decryptSecret, encryptSecret } from '@/lib/crypto'
import { getValidAccessToken } from '@/lib/token-refresh'

/**
 * Matches lib/crypto.ts's `v1.<iv>.<tag>.<ciphertext>` output. Google tokens
 * never take this shape (access tokens start `ya29.`, refresh tokens `1//`), so
 * there is no ambiguity between a legacy plaintext row and a ciphertext.
 */
const ENCRYPTED_FORMAT = /^v1\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}\.[A-Za-z0-9+/]+={0,2}$/

export function isEncryptedToken(value: string | null | undefined): boolean {
    return typeof value === 'string' && ENCRYPTED_FORMAT.test(value)
}

/**
 * Encrypt a token for storage. Already-encrypted input is returned unchanged so
 * the backfill and lazy migration can never double-encrypt a row.
 */
export function encryptToken(token: string): string {
    if (isEncryptedToken(token)) return token
    return encryptSecret(token)
}

/**
 * Decrypt a stored token. Legacy plaintext is returned as-is.
 *
 * A value that *looks* encrypted but fails to decrypt (wrong key, tampering)
 * throws rather than falling back: passing ciphertext to Google would only
 * produce a confusing invalid_grant much further from the cause.
 */
export function decryptToken(stored: string | null | undefined): string | null {
    if (!stored) return null
    if (!isEncryptedToken(stored)) return stored
    return decryptSecret(stored)
}

export interface StoredGmailAccount {
    id: string
    user_id: string
    access_token: string | null
    refresh_token: string | null
    token_expiry: string | null
}

/**
 * Return a usable plaintext access token for the account, refreshing it with
 * Google when it is missing or about to expire.
 *
 * A refreshed token is persisted encrypted, scoped by both id and user_id so a
 * mismatched pair can never overwrite another tenant's row. If the row still
 * holds a legacy plaintext refresh token, it is encrypted in the same write.
 */
export async function getValidGmailAccessToken(
    supabase: SupabaseClient<any, any, any>,
    account: StoredGmailAccount
): Promise<string> {
    const result = await getValidAccessToken(
        decryptToken(account.access_token),
        decryptToken(account.refresh_token),
        account.token_expiry
    )

    if (result.needsUpdate && result.newExpiry) {
        const update: Record<string, string> = {
            access_token: encryptToken(result.accessToken),
            token_expiry: result.newExpiry,
        }

        if (account.refresh_token && !isEncryptedToken(account.refresh_token)) {
            update.refresh_token = encryptToken(account.refresh_token)
        }

        const { error } = await supabase
            .from('gmail_accounts')
            .update(update)
            .eq('id', account.id)
            .eq('user_id', account.user_id)

        // The fresh token is still valid for this request; failing to cache it
        // only costs another refresh next time, so don't fail the caller.
        if (error) {
            console.error('[Gmail Tokens] Failed to persist refreshed token:', error.message)
        }
    }

    return result.accessToken
}
