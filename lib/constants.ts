/**
 * Google OAuth Scopes - Separated for different purposes
 */

/**
 * Basic Google OAuth scopes for user login (no Gmail/Drive access)
 * Used when signing in with Google to create an account
 */
export const GOOGLE_LOGIN_SCOPES = [
  'openid',
  'email',
  'profile',
].join(' ')

/**
 * Gmail + Drive scopes for email sync functionality
 * Used when user connects their Gmail account after login
 *
 * - gmail.readonly: Read emails and attachments
 * - gmail.modify: Modify emails (add labels, archive, etc.)
 * - gmail.labels: Create and manage Gmail labels
 * - drive.file: Access Google Drive files created by the app
 * - userinfo.email: Get user's email for verification
 */
export const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ')

/**
 * @deprecated Use GMAIL_SCOPES for Gmail connection or GOOGLE_LOGIN_SCOPES for login
 */
export const GOOGLE_SCOPES = GMAIL_SCOPES
