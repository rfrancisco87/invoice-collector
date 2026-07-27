/**
 * Credential token generation for invites and password resets.
 *
 * The two have deliberately different handling:
 *
 *   Invite codes are typed by a human, so they use an unambiguous alphabet and
 *   are stored in plaintext — an admin has to be able to re-read one to resend
 *   it, and the worst case is one unwanted account, gated further by expiry,
 *   single use, and optional email pinning.
 *
 *   Reset tokens are credential-equivalent: possession is enough to take over
 *   an account. They are long, random, never displayed, and only their SHA-256
 *   hash is persisted.
 */

import { createHash, randomBytes, timingSafeEqual } from 'crypto'
import { customAlphabet } from 'nanoid'

/** No 0/O/1/I/L — these get misread and mistyped when copied by hand. */
const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const INVITE_SEGMENT_LENGTH = 4

const inviteSegment = customAlphabet(INVITE_ALPHABET, INVITE_SEGMENT_LENGTH)

export const INVITE_EXPIRY_DAYS = 14
export const RESET_TOKEN_EXPIRY_MINUTES = 60

/**
 * Human-typeable single-use invite code, e.g. `INV-7K2M-QX4P`.
 *
 * ~31^8 ≈ 8.5e11 combinations. Codes are looked up by exact match on a unique
 * column and are individually expiring and single-use, so guessing is not a
 * practical attack; the format optimises for being read off a screen instead.
 */
export function generateInviteCode(): string {
    return `INV-${inviteSegment()}-${inviteSegment()}`
}

/** Normalise user input before lookup: codes are stored uppercase and hyphenated. */
export function normaliseInviteCode(raw: string): string {
    return raw.trim().toUpperCase()
}

/**
 * Opaque password-reset token. Returned to the caller once, for emailing; only
 * `hashToken(token)` is ever stored.
 */
export function generateResetToken(): string {
    return randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex')
}

/**
 * Constant-time comparison for token hashes. Both sides are hex SHA-256
 * digests, so a length mismatch means malformed input rather than a near miss.
 */
export function tokenHashesMatch(a: string, b: string): boolean {
    const bufferA = Buffer.from(a, 'hex')
    const bufferB = Buffer.from(b, 'hex')

    if (bufferA.length !== bufferB.length || bufferA.length === 0) return false

    return timingSafeEqual(bufferA, bufferB)
}

export function inviteExpiryDate(now: Date = new Date()): Date {
    return new Date(now.getTime() + INVITE_EXPIRY_DAYS * 24 * 60 * 60 * 1000)
}

export function resetTokenExpiryDate(now: Date = new Date()): Date {
    return new Date(now.getTime() + RESET_TOKEN_EXPIRY_MINUTES * 60 * 1000)
}

export interface PasswordPolicyResult {
    ok: boolean
    error?: string
}

/**
 * Minimum bar for a password. Length does the heavy lifting; composition rules
 * mostly push people toward predictable substitutions.
 */
export function checkPasswordPolicy(password: unknown): PasswordPolicyResult {
    if (typeof password !== 'string') {
        return { ok: false, error: 'Password is required.' }
    }

    if (password.length < 10) {
        return { ok: false, error: 'A palavra-passe deve ter pelo menos 10 caracteres.' }
    }

    if (password.length > 200) {
        return { ok: false, error: 'A palavra-passe é demasiado longa.' }
    }

    return { ok: true }
}
