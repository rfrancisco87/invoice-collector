import type { SupabaseClient } from '@supabase/supabase-js'
import { sendNewDocumentsEmail } from '@/lib/email'

/**
 * New-document notification, shared by every ingestion path.
 *
 * Gmail sync (cron and manual) and inbound forwarding all create documents,
 * but only the sync routes used to send the email — invoices that arrived by
 * forwarding were saved silently. And because the email was built from an
 * in-memory list, a sync that died after saving documents (or a Resend error)
 * lost those notifications for good: the next run saw the files as
 * duplicates. Notification state now lives on the row (documents.notified_at),
 * so whatever wasn't notified is picked up by the next call, from any path.
 */

/** How far back an un-notified document still counts as news. */
const NOTIFY_WINDOW_DAYS = 7

const SUMMARY_COLUMNS =
  'id, filename, sender, subject, received_date, final_classification, confidence_score'

type NotificationSettings = {
  email_notifications_enabled?: boolean | null
  notification_email?: string | null
  drive_folder_id: string | null
}

export type NotificationOutcome = { sent: boolean; count: number; reason?: string }

/** notification_email if set, otherwise the account email on the profile. */
export async function resolveNotificationEmail(
  supabase: SupabaseClient,
  userId: string,
  settings: { notification_email?: string | null }
): Promise<string | null> {
  const configured = settings.notification_email?.trim()
  if (configured) return configured

  const { data: profile } = await supabase
    .from('profiles')
    .select('email')
    .eq('id', userId)
    .maybeSingle()

  return (profile as any)?.email ?? null
}

/** Postgres "undefined_column": migration 027 not applied yet. */
function isMissingColumn(error: { code?: string } | null) {
  return error?.code === '42703'
}

/**
 * Email the user about every pending document not yet notified.
 *
 * Rows are claimed (notified_at set where still null) before sending, so two
 * overlapping runs can't both email the same document; if the send fails the
 * claim is released and the next run retries.
 *
 * `fallbackDocumentIds` is only used if the notified_at column doesn't exist
 * yet (code deployed before the migration), so notifications keep working in
 * the old best-effort way instead of silently stopping.
 */
export async function notifyPendingDocuments(
  supabase: SupabaseClient,
  userId: string,
  settings: NotificationSettings,
  fallbackDocumentIds: string[] = []
): Promise<NotificationOutcome> {
  const since = new Date(Date.now() - NOTIFY_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString()

  if (!settings.email_notifications_enabled) {
    // Mark them handled so turning notifications back on later doesn't
    // dump a backlog of old documents into one email.
    const { error } = await supabase
      .from('documents')
      .update({ notified_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('notified_at', null)
    if (error && !isMissingColumn(error)) {
      console.error(`[Notifications] Failed to mark documents for user ${userId}:`, error)
    }
    return { sent: false, count: 0, reason: 'disabled' }
  }

  const claimedAt = new Date().toISOString()
  const { data: claimed, error: claimError } = await supabase
    .from('documents')
    .update({ notified_at: claimedAt })
    .eq('user_id', userId)
    .eq('status', 'pending')
    .is('notified_at', null)
    .gte('created_at', since)
    .select(SUMMARY_COLUMNS)

  if (isMissingColumn(claimError)) {
    return notifyDocumentsById(supabase, userId, settings, fallbackDocumentIds)
  }
  if (claimError) {
    return { sent: false, count: 0, reason: claimError.message }
  }
  if (!claimed?.length) return { sent: false, count: 0, reason: 'no new documents' }

  const outcome = await send(supabase, userId, settings, claimed)

  if (!outcome.sent) {
    const { error: releaseError } = await supabase
      .from('documents')
      .update({ notified_at: null })
      .eq('user_id', userId)
      .eq('notified_at', claimedAt)
      .in('id', claimed.map((d: any) => d.id))
    if (releaseError) {
      console.error(`[Notifications] Failed to release claim for user ${userId}:`, releaseError)
    }
  }

  return outcome
}

/** Pre-migration path: notify exactly the given ids, no retry bookkeeping. */
async function notifyDocumentsById(
  supabase: SupabaseClient,
  userId: string,
  settings: NotificationSettings,
  documentIds: string[]
): Promise<NotificationOutcome> {
  if (documentIds.length === 0) return { sent: false, count: 0, reason: 'no new documents' }

  const { data: documents, error } = await supabase
    .from('documents')
    .select(SUMMARY_COLUMNS)
    .in('id', documentIds)
    .eq('user_id', userId)

  if (error || !documents?.length) {
    return { sent: false, count: 0, reason: error?.message ?? 'documents not found' }
  }
  return send(supabase, userId, settings, documents)
}

async function send(
  supabase: SupabaseClient,
  userId: string,
  settings: NotificationSettings,
  documents: any[]
): Promise<NotificationOutcome> {
  const targetEmail = await resolveNotificationEmail(supabase, userId, settings)
  if (!targetEmail) {
    return { sent: false, count: documents.length, reason: 'no destination email' }
  }

  try {
    await sendNewDocumentsEmail(
      targetEmail,
      documents.map((d) => ({ ...d, confidence_score: d.confidence_score ?? 0 })),
      settings.drive_folder_id
    )
    return { sent: true, count: documents.length }
  } catch (err) {
    return {
      sent: false,
      count: documents.length,
      reason: err instanceof Error ? err.message : String(err),
    }
  }
}
