// Google OAuth Scopes
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
].join(' ')

// Portuguese invoice keywords
export const INVOICE_KEYWORDS = [
  'fatura',
  'factura',
  'invoice',
  'ft',
  'fa',
]

export const CREDIT_NOTE_KEYWORDS = [
  'nota de crédito',
  'nota de credito',
  'credit note',
  'nc',
]

// Common Portuguese invoice sender domains
export const KNOWN_INVOICE_SENDERS = [
  'invoicexpress.com',
  'moloni.pt',
  'sage.pt',
  'sap.com',
]
