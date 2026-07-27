/**
 * Verification for lib/crypto.ts.
 *
 * This protects user-supplied LLM API keys — third-party billing credentials.
 * The properties that matter: a round trip is lossless, ciphertexts are not
 * deterministic, tampering is detected rather than silently decrypted, and a
 * wrong key fails loudly.
 *
 * Usage:  npx tsx scripts/verify-crypto.ts
 */

process.env.ENCRYPTION_KEY =
    process.env.ENCRYPTION_KEY ||
    '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef'

import { decryptSecret, encryptSecret, isEncryptionConfigured, keyHint } from '../lib/crypto'

let failures = 0

function check(name: string, condition: boolean, detail = '') {
    if (!condition) failures++
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ${detail}`}`)
}

const secret = 'sk-ant-api03-ThisIsNotARealKey_1234567890abcdefXYZ'

// Round trip
const encrypted = encryptSecret(secret)
check('round trip returns original', decryptSecret(encrypted) === secret)
check('ciphertext does not contain plaintext', !encrypted.includes(secret))
check('versioned format', encrypted.startsWith('v1.') && encrypted.split('.').length === 4)

// Non-deterministic: a fresh IV each time means identical keys do not produce
// identical rows, so the database cannot be used to spot users sharing a key.
const second = encryptSecret(secret)
check('same input encrypts differently', encrypted !== second)
check('both decrypt to the same value', decryptSecret(second) === secret)

// Tamper detection — the reason for GCM over CBC.
const parts = encrypted.split('.')
const flipped = Buffer.from(parts[3], 'base64')
flipped[0] ^= 0xff
const tampered = [parts[0], parts[1], parts[2], flipped.toString('base64')].join('.')

let tamperRejected = false
try {
    decryptSecret(tampered)
} catch {
    tamperRejected = true
}
check('tampered ciphertext is rejected', tamperRejected)

// Malformed input
let malformedRejected = false
try {
    decryptSecret('not-a-ciphertext')
} catch {
    malformedRejected = true
}
check('malformed payload is rejected', malformedRejected)

// Wrong key must not silently return garbage
const originalKey = process.env.ENCRYPTION_KEY
process.env.ENCRYPTION_KEY = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
let wrongKeyRejected = false
try {
    decryptSecret(encrypted)
} catch {
    wrongKeyRejected = true
}
check('wrong key is rejected', wrongKeyRejected)
process.env.ENCRYPTION_KEY = originalKey

// Passphrase (non-hex) keys are accepted via hashing
process.env.ENCRYPTION_KEY = 'a passphrase rather than a hex key'
const passphraseEncrypted = encryptSecret(secret)
check('passphrase key round trips', decryptSecret(passphraseEncrypted) === secret)
process.env.ENCRYPTION_KEY = originalKey

// Missing key is reported, not silently bypassed
delete process.env.ENCRYPTION_KEY
check('missing key reported as unconfigured', isEncryptionConfigured() === false)
let missingKeyThrows = false
try {
    encryptSecret(secret)
} catch {
    missingKeyThrows = true
}
check('encrypt without key throws', missingKeyThrows)
process.env.ENCRYPTION_KEY = originalKey

// Hints must reveal almost nothing
const hint = keyHint(secret)
check('hint keeps only last 4 chars', hint.endsWith(secret.slice(-4)), hint)
check('hint does not leak the key body', !hint.includes(secret.slice(10, 30)), hint)
console.log(`      hint sample: ${hint}`)

console.log(failures === 0 ? '\nAll crypto checks passed.' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
