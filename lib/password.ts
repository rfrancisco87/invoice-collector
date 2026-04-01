import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'

const KEY_LENGTH = 64

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, KEY_LENGTH).toString('hex')
  return `${salt}:${hash}`
}

export function verifyPassword(password: string, storedHash: string) {
  const [salt, expectedHash] = storedHash.split(':')

  if (!salt || !expectedHash) {
    return false
  }

  const derivedKey = scryptSync(password, salt, KEY_LENGTH)
  const expectedKey = Buffer.from(expectedHash, 'hex')

  if (derivedKey.length !== expectedKey.length) {
    return false
  }

  return timingSafeEqual(derivedKey, expectedKey)
}
