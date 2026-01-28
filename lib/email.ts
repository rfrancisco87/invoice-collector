import { Resend } from 'resend'

if (!process.env.RESEND_API_KEY) {
  console.warn('[Email] WARNING: RESEND_API_KEY environment variable is not set!')
}

const resend = new Resend(process.env.RESEND_API_KEY)

interface Document {
  id: string
  filename: string
  sender: string
  subject: string
  received_date: string
  final_classification: string
  confidence_score: number
}

export async function sendNewDocumentsEmail(
  toEmail: string,
  documents: Document[],
  driveFolderId: string
) {
  try {
    const driveUrl = `https://drive.google.com/drive/folders/${driveFolderId}`

    const documentsList = documents
      .map(
        (doc, index) => `
      <tr>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${doc.filename}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${doc.sender}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">
          <span style="display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; background-color: ${
            doc.final_classification === 'invoice'
              ? '#dcfce7'
              : doc.final_classification === 'credit_note'
              ? '#fed7aa'
              : '#f3f4f6'
          }; color: ${
            doc.final_classification === 'invoice'
              ? '#166534'
              : doc.final_classification === 'credit_note'
              ? '#9a3412'
              : '#374151'
          };">
            ${
              doc.final_classification === 'invoice'
                ? 'Invoice'
                : doc.final_classification === 'credit_note'
                ? 'Credit Note'
                : 'Other'
            }
          </span>
        </td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${new Date(
          doc.received_date
        ).toLocaleDateString()}</td>
      </tr>
    `
      )
      .join('')

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Invoices Detected</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #374151; margin: 0; padding: 0; background-color: #f9fafb;">
  <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
    <!-- Header -->
    <div style="background-color: #2563eb; padding: 24px; border-radius: 8px 8px 0 0; text-align: center;">
      <h1 style="margin: 0; color: white; font-size: 24px; font-weight: 600;">Invoice Collector</h1>
    </div>

    <!-- Content -->
    <div style="background-color: white; padding: 32px; border-radius: 0 0 8px 8px; box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.1);">
      <h2 style="margin: 0 0 16px 0; color: #111827; font-size: 20px; font-weight: 600;">New Documents Detected</h2>

      <p style="margin: 0 0 24px 0; color: #6b7280; font-size: 16px;">
        We found <strong style="color: #2563eb;">${documents.length}</strong> new ${
      documents.length === 1 ? 'document' : 'documents'
    } in your Gmail.
      </p>

      <!-- Documents Table -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
        <thead>
          <tr style="background-color: #f3f4f6;">
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">#</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Filename</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Sender</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Type</th>
            <th style="padding: 12px; text-align: left; font-weight: 600; color: #374151; border-bottom: 2px solid #e5e7eb;">Date</th>
          </tr>
        </thead>
        <tbody>
          ${documentsList}
        </tbody>
      </table>

      <!-- Action Button -->
      <div style="text-align: center; margin-top: 32px;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard"
           style="display: inline-block; background-color: #2563eb; color: white; padding: 12px 32px; border-radius: 6px; text-decoration: none; font-weight: 500; font-size: 16px;">
          Review Documents
        </a>
      </div>

      <p style="margin: 24px 0 0 0; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px; text-align: center;">
        Documents are waiting for your review in the <a href="${driveUrl}" style="color: #2563eb; text-decoration: none;">Pending Approval folder</a>.
      </p>
    </div>

    <!-- Footer -->
    <div style="margin-top: 24px; text-align: center; color: #9ca3af; font-size: 12px;">
      <p style="margin: 0 0 8px 0;">You're receiving this email because you have notifications enabled.</p>
      <p style="margin: 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL}/dashboard" style="color: #6b7280; text-decoration: none;">Manage notification settings</a>
      </p>
    </div>
  </div>
</body>
</html>
    `

    // Use Resend's testing domain if EMAIL_FROM is not set
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev'

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: `${documents.length} New ${documents.length === 1 ? 'Invoice' : 'Invoices'} Detected`,
      html,
    })

    if (error) {
      throw new Error(`Failed to send email: ${error.message}`)
    }

    return { success: true, emailId: data?.id }
  } catch (error) {
    console.error('Email send error:', error)
    throw error
  }
}

export async function sendTestEmail(toEmail: string) {
  try {
    // Use Resend's testing domain if EMAIL_FROM is not set
    // To use a custom domain, verify it in Resend dashboard and set EMAIL_FROM env var
    const fromEmail = process.env.EMAIL_FROM || 'onboarding@resend.dev'

    console.log('[Email] Sending test email to:', toEmail)
    console.log('[Email] From address:', fromEmail)
    console.log('[Email] API Key present:', !!process.env.RESEND_API_KEY)

    const { data, error } = await resend.emails.send({
      from: fromEmail,
      to: toEmail,
      subject: 'Test Email - Invoice Collector',
      html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Test Email</title>
</head>
<body style="font-family: sans-serif; line-height: 1.6; color: #374151; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #2563eb;">Email Notifications Active</h1>
  <p>Your email notifications are working correctly!</p>
  <p>You'll receive notifications when new invoices are detected in your Gmail.</p>
  <p style="margin-top: 24px; padding-top: 24px; border-top: 1px solid #e5e7eb; color: #9ca3af; font-size: 14px;">
    Invoice Collector - Automatic invoice organization
  </p>
</body>
</html>
      `,
    })

    if (error) {
      console.error('[Email] Resend API error:', error)
      throw new Error(`Failed to send test email: ${error.message}`)
    }

    console.log('[Email] Test email sent successfully. Email ID:', data?.id)
    return { success: true, emailId: data?.id }
  } catch (error) {
    console.error('[Email] Test email error:', error)
    throw error
  }
}
