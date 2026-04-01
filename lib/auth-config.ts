function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? null
}

export function getAllowedOwnerEmail() {
  return normalizeEmail(process.env.ALLOWED_LOGIN_EMAIL)
}

export function isAllowedOwnerEmail(email?: string | null) {
  const allowedEmail = getAllowedOwnerEmail()

  if (!allowedEmail) {
    return true
  }

  return normalizeEmail(email) === allowedEmail
}
