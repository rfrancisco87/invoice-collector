/**
 * Symmetric encryption for secrets at rest.
 *
 * Used for user-supplied LLM API keys, which are third-party billing
 * credentials: a leak costs the user money and is not something they can detect
 * from inside this app. Storing them in plaintext because "the database is
 * private" is the same reasoning that left a service_role key in this repo.
 *
 * AES-256-GCM. GCM is authenticated, so tampering with a ciphertext is detected
 * on decrypt rather than silently producing garbage that then gets sent to a
 * provider as a key.
 *
 * Format:  v1.<iv-b64>.<authTag-b64>.<ciphertext-b64>
 *
 * The version prefix exists so the key can be rotated or the scheme changed
 * later without having to guess how an existing row was encrypted.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 96 bits, the size GCM is specified for
const VERSION = 'v1'

/**
 * Derive the 32-byte key from ENCRYPTION_KEY.
 *
 * Accepts either a 64-character hex string (a real 256-bit key, preferred) or
 * an arbitrary passphrase, which is hashed to length. The hash path is a
 * convenience, not a KDF — it adds no work factor — so the documented
 * recommendation is `openssl rand -hex 32`.
 */
function getKey(): Buffer {
    const secret = process.env.ENCRYPTION_KEY

    if (!secret || !secret.trim()) {
        throw new Error(
            'Missing ENCRYPTION_KEY. Generate one with `openssl rand -hex 32` and set it in the environment.'
        )
    }

    if (/^[0-9a-f]{64}$/i.test(secret.trim())) {
        return Buffer.from(secret.trim(), 'hex')
    }

    return createHash('sha256').update(secret).digest()
}

/** True when encryption is usable, for surfacing config problems in the UI. */
export function isEncryptionConfigured(): boolean {
    try {
        getKey()
        return true
    } catch {
        return false
    }
}

export function encryptSecret(plaintext: string): string {
    if (typeof plaintext !== 'string' || plaintext.length === 0) {
        throw new Error('Cannot encrypt an empty value')
    }

    const iv = randomBytes(IV_LENGTH)
    const cipher = createCipheriv(ALGORITHM, getKey(), iv)

    const ciphertext = Buffer.concat([
        cipher.update(plaintext, 'utf8'),
        cipher.final(),
    ])

    return [
        VERSION,
        iv.toString('base64'),
        cipher.getAuthTag().toString('base64'),
        ciphertext.toString('base64'),
    ].join('.')
}

export function decryptSecret(payload: string): string {
    const parts = payload.split('.')

    if (parts.length !== 4 || parts[0] !== VERSION) {
        throw new Error('Malformed or unsupported ciphertext')
    }

    const [, ivB64, authTagB64, ciphertextB64] = parts

    const decipher = createDecipheriv(ALGORITHM, getKey(), Buffer.from(ivB64, 'base64'))
    decipher.setAuthTag(Buffer.from(authTagB64, 'base64'))

    // Throws if the auth tag does not verify — wrong key, or tampered data.
    return Buffer.concat([
        decipher.update(Buffer.from(ciphertextB64, 'base64')),
        decipher.final(),
    ]).toString('utf8')
}

/**
 * Non-secret hint for display, e.g. `sk-ant-…4f2a`.
 *
 * Only the last four characters are revealed — enough for the user to tell two
 * of their own keys apart, not enough to be useful to anyone else.
 */
export function keyHint(secret: string): string {
    const trimmed = secret.trim()

    if (trimmed.length <= 8) return '…'

    const prefixMatch = trimmed.match(/^(sk-[a-z-]*)/i)
    const prefix = prefixMatch ? prefixMatch[1] : trimmed.slice(0, 3)

    return `${prefix}…${trimmed.slice(-4)}`
}
