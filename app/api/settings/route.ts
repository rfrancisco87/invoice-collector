import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { sendTestEmail } from '@/lib/email'
import { createFolderStructure, deleteDriveFolder } from '@/lib/google-drive'
import { getValidAccessToken } from '@/lib/token-refresh'

export async function GET() {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: settings, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    if (error || !settings) {
      return NextResponse.json({ error: 'Settings not found' }, { status: 404 })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    return NextResponse.json(
      { error: 'Failed to fetch settings', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function PATCH(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    // Fetch current settings for reference (needed for effective values)
    const { data: currentSettings } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single()

    const body = await request.json()
    const {
      sync_days_back,
      auto_sync_enabled,
      email_notifications_enabled,
      notification_email,
      gmail_sync_label,
      archive_synced_emails,
      subscription_tier,
      enabled_sources,
      onboarding_completed,
      drive_folder_id,
      drive_folder_name,
      drive_folder_path,
      inbox_folder_id,
      inbox_folder_name,
      inbox_folder_enabled,
      inbox_folder_mode,
      approved_folder_id,
      approved_folder_name,
      approved_folder_mode,
      webhook_url,
    } = body

    console.log('DEBUG: Settings PATCH received:', JSON.stringify(body, null, 2))

    const updates: any = {}

    if (sync_days_back !== undefined) updates.sync_days_back = sync_days_back
    if (auto_sync_enabled !== undefined) updates.auto_sync_enabled = auto_sync_enabled
    if (email_notifications_enabled !== undefined) updates.email_notifications_enabled = email_notifications_enabled
    if (notification_email !== undefined) {
      const normalizedNotificationEmail =
        typeof notification_email === 'string' ? notification_email.trim() : notification_email
      updates.notification_email = normalizedNotificationEmail || null
    }
    if (gmail_sync_label !== undefined) updates.gmail_sync_label = gmail_sync_label || null
    if (archive_synced_emails !== undefined) updates.archive_synced_emails = archive_synced_emails
    if (webhook_url !== undefined) updates.webhook_url = webhook_url || null
    if (enabled_sources !== undefined) updates.enabled_sources = enabled_sources

    // Drive settings
    if (drive_folder_id !== undefined) updates.drive_folder_id = drive_folder_id
    if (drive_folder_name !== undefined) updates.drive_folder_name = drive_folder_name
    if (drive_folder_path !== undefined) updates.drive_folder_path = drive_folder_path

    // Inbox folder settings
    if (inbox_folder_id !== undefined) updates.inbox_folder_id = inbox_folder_id
    if (inbox_folder_name !== undefined) updates.inbox_folder_name = inbox_folder_name
    if (inbox_folder_enabled !== undefined) updates.inbox_folder_enabled = inbox_folder_enabled
    const effectiveInboxMode: 'managed' | 'existing' =
      inbox_folder_mode === 'existing' ||
        (inbox_folder_mode === undefined && currentSettings?.inbox_folder_name && currentSettings.inbox_folder_name !== 'Inbox')
        ? 'existing'
        : 'managed'
    updates.inbox_folder_mode = effectiveInboxMode

    if (effectiveInboxMode === 'existing' && inbox_folder_mode !== undefined) {
      if (!inbox_folder_name) {
        updates.inbox_folder_name = currentSettings?.inbox_folder_name || 'Inbox'
      }
    }

    if (
      inbox_folder_enabled === true &&
      effectiveInboxMode === 'existing' &&
      !(inbox_folder_id || currentSettings?.inbox_folder_id)
    ) {
      return NextResponse.json(
        { error: 'Selecione uma pasta existente para a Inbox.' },
        { status: 400 }
      )
    }

    // Approved folder settings
    if (approved_folder_mode !== undefined) updates.approved_folder_mode = approved_folder_mode
    if (approved_folder_name !== undefined) updates.approved_folder_name = approved_folder_name
    if (approved_folder_id !== undefined) updates.approved_folder_id = approved_folder_id

    if (subscription_tier !== undefined) {
      updates.subscription_tier = subscription_tier
      // Automatically set sync frequency based on subscription tier
      updates.sync_frequency_minutes = subscription_tier === 'paid' ? 15 : 720
    }

    // Auto-create folder structure if we have a Drive Folder ID
    const effectiveDriveId = drive_folder_id !== undefined ? drive_folder_id : (currentSettings?.drive_folder_id)
    const effectiveInboxEnabled = inbox_folder_enabled !== undefined ? inbox_folder_enabled : (currentSettings?.inbox_folder_enabled)

    // Check if we need to run folder structure creation
    // Run if:
    // 1. drive_folder_id changed and is not null
    // 2. inbox_folder_enabled changed to true and we have a drive_folder_id
    // 3. Just to be safe, if we have a drive_folder_id, let's ensure structure on every save? 
    //    Maybe overkill. Let's stick to explicit changes or if subfolder IDs are missing.
    // For simplicity/robustness: If we have a Drive Folder ID, ensure structure.

    if (effectiveDriveId) {
      // We need a Google token
      const { data: gmailAccount } = await supabase
        .from('gmail_accounts')
        .select('*')
        .eq('user_id', user.id)
        .single()

      if (gmailAccount) {
        try {
          const tokenResult = await getValidAccessToken(
            gmailAccount.access_token,
            gmailAccount.refresh_token,
            gmailAccount.token_expiry
          )

          // Update database if token was refreshed
          if (tokenResult.needsUpdate && tokenResult.newExpiry) {
            await supabase
              .from('gmail_accounts')
              .update({
                access_token: tokenResult.accessToken,
                token_expiry: tokenResult.newExpiry,
              })
              .eq('id', gmailAccount.id)
          }

          // Handle Inbox Folder Logic
          if (inbox_folder_enabled === false && currentSettings?.inbox_folder_id) {
            const currentInboxIsManaged = currentSettings?.inbox_folder_name === 'Inbox'

            // Only auto-delete folders that were app-managed.
            if (currentInboxIsManaged) {
              try {
                await deleteDriveFolder(tokenResult.accessToken, currentSettings.inbox_folder_id)
              } catch (delErr) {
                console.error('Failed to delete inbox folder:', delErr)
              }
            }

            updates.inbox_folder_id = null
            updates.inbox_folder_name = null
          } else {
            // Ensure structure / Create Inbox if needed
            // For existing-folder mode, never auto-create Inbox.
            const structure = await createFolderStructure(
              tokenResult.accessToken,
              effectiveDriveId,
              !!effectiveInboxEnabled && effectiveInboxMode === 'managed'
            )

            // Save subfolder IDs
            updates.pending_folder_id = structure.pendingId

            // Only use auto-created approved folder if mode is managed
            const effectiveApprovedMode = approved_folder_mode ?? currentSettings?.approved_folder_mode ?? 'managed'
            if (effectiveApprovedMode !== 'existing') {
              updates.approved_folder_id = structure.approvedId
              updates.approved_folder_name = null
              updates.approved_folder_mode = 'managed'
            }
            if (structure.inboxId && effectiveInboxEnabled && effectiveInboxMode === 'managed') {
              updates.inbox_folder_id = structure.inboxId
              updates.inbox_folder_name = 'Inbox'
            }
          }

        } catch (err) {
          console.error('Failed to ensure folder structure:', err)
        }
      }
    }

    let settingsResult = await supabase
      .from('user_settings')
      .upsert({ user_id: user.id, ...updates }, { onConflict: 'user_id' })
      .select()
      .single()

    // Backward compatibility if DB migration hasn't been applied yet.
    if (settingsResult.error?.message?.includes('inbox_folder_mode')) {
      const fallbackUpdates = { ...updates }
      delete (fallbackUpdates as any).inbox_folder_mode

      settingsResult = await supabase
        .from('user_settings')
        .upsert({ user_id: user.id, ...fallbackUpdates }, { onConflict: 'user_id' })
        .select()
        .single()
    }

    const { data: settings, error } = settingsResult

    if (onboarding_completed !== undefined) {
      await supabase
        .from('profiles')
        .update({
          onboarding_completed: onboarding_completed,
          updated_at: new Date().toISOString(),
        })
        .eq('id', user.id)
    }

    if (error) {
      console.error('[Settings API] Supabase error:', error)
      return NextResponse.json({
        error: 'Failed to update settings',
        details: error.message,
        code: error.code,
        // @ts-ignore - hint exists in some Supabase error types
        hint: error.hint
      }, { status: 500 })
    }

    return NextResponse.json({ settings })
  } catch (error) {
    console.error('[Settings API] Critical error:', error)
    const message = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json(
      { error: 'Failed to update settings', details: message },
      { status: 500 }
    )
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()

    const body = await request.json()
    const { action, notification_email } = body

    if (action === 'test_email') {
      // Check if Resend API key is configured
      if (!process.env.RESEND_API_KEY) {
        return NextResponse.json(
          {
            error: 'Resend API key not configured',
            details: 'Please restart your development server after adding RESEND_API_KEY to .env.local'
          },
          { status: 500 }
        )
      }

      const { data: settings } = await supabase
        .from('user_settings')
        .select('notification_email')
        .eq('user_id', user.id)
        .single()

      const requestedTestEmail =
        typeof notification_email === 'string' ? notification_email.trim() : ''
      const emailTo = requestedTestEmail || settings?.notification_email?.trim() || user.email

      if (!emailTo) {
        return NextResponse.json({ error: 'No email address configured' }, { status: 400 })
      }

      try {
        await sendTestEmail(emailTo)
        return NextResponse.json({ success: true, message: 'Test email sent' })
      } catch (emailError) {
        const errorMessage = emailError instanceof Error ? emailError.message : 'Unknown error'

        // Check if it's a Resend validation error about email restrictions
        if (errorMessage.includes('You can only send testing emails to your own email address')) {
          return NextResponse.json(
            {
              error: 'Email restriction',
              details: 'With the free Resend plan, test emails can only be sent to the account owner\'s email. Please verify a domain at resend.com/domains to send to other addresses, or update your notification email to match your Resend account email.'
            },
            { status: 403 }
          )
        }

        return NextResponse.json(
          { error: 'Failed to send test email', details: errorMessage },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    return NextResponse.json(
      { error: 'Action failed', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
