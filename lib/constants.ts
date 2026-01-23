/**
 * Google OAuth Scopes
 *
 * Required scopes for the application:
 * - gmail.readonly: Read emails and attachments
 * - gmail.modify: Modify emails (add labels, mark as read, etc.)
 * - gmail.labels: Create and manage Gmail labels
 * - drive.file: Access Google Drive files created by the app
 */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.modify',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/drive.file',
].join(' ')
