/**
 * Verification for lib/webhook-signature.ts.
 *
 * This signature check is the only authentication on /api/inbound-email — that
 * route is exempt from the middleware session check, so a bug here means anyone
 * can write documents into any user's account. Worth pinning against the
 * published Svix test vector.
 *
 * Usage:  npx tsx scripts/verify-webhook-signature.ts
 */

import { verifySvixSignature } from '../lib/webhook-signature'

// Published Svix test vector
const secret = 'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw'
const id = 'msg_p5jXN8AQM9LWM0D4loKWxJek'
const timestamp = '1614265330'
const payload = '{"test": 2432232314}'
const goodSig = 'v1,g0hM9SsE+OTPJTGt/tmIKtSyZlE3uFJELVlNIOLJ1OE='
const nowMs = 1614265330 * 1000

const cases: Array<[string, any, boolean]> = [
  ['valid signature', { id, timestamp, signature: goodSig }, true],
  ['multiple sigs (rotation)', { id, timestamp, signature: `v1,aaaa= ${goodSig}` }, true],
  ['wrong signature', { id, timestamp, signature: 'v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' }, false],
  ['tampered payload', { id, timestamp, signature: goodSig }, false],
  ['missing headers', { id: null, timestamp, signature: goodSig }, false],
  ['stale timestamp', { id, timestamp: String(1614265330 - 600), signature: goodSig }, false],
  ['unknown version', { id, timestamp, signature: `v2,${goodSig.slice(3)}` }, false],
]

let failures = 0
for (const [name, headers, expected] of cases) {
  const body = name === 'tampered payload' ? '{"test": 9999999999}' : payload
  const secretForCase = secret
  const result = verifySvixSignature(body, headers, secretForCase, nowMs)
  const ok = result.valid === expected
  if (!ok) failures++
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  -> valid=${result.valid}${'reason' in result ? ` (${result.reason})` : ''}`)
}

// Fail-closed when no secret configured
const noSecret = verifySvixSignature(payload, { id, timestamp, signature: goodSig }, undefined, nowMs)
const okNoSecret = noSecret.valid === false
if (!okNoSecret) failures++
console.log(`${okNoSecret ? 'PASS' : 'FAIL'}  missing secret fails closed -> valid=${noSecret.valid}`)

console.log(failures === 0 ? '\nAll signature tests passed.' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
