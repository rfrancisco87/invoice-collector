import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'crypto'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'
import { runUserSync } from '@/lib/sync-runner'
import { notifyPendingDocuments } from '@/lib/notifications'

// One call sweeps every due user. Without this the platform default timeout
// can kill the function after documents are saved but before the
// notification email goes out, and those documents are never notified.
export const maxDuration = 300

/**
 * Automated sync sweep.
 *
 * This route used to reimplement the entire ingestion pipeline inline —
 * hashing, Drive upload, webhook classification and the insert — rather than
 * reusing lib/ingestion.ts. The two copies drifted: this one never called
 * checkAutoDecision, so auto-reject rules simply did not apply to automated
 * syncs, and every classification change had to be made twice.
 *
 * It now does only what is genuinely cron-specific — deciding who is due and
 * recording the outcome — and delegates the document work to runUserSync, the
 * same function /api/sync calls.
 */

/** Paid tier syncs every 15 minutes; free tier falls back to its stored frequency. */
const PAID_TIER_SYNC_MINUTES = 15
const DEFAULT_FREE_TIER_SYNC_MINUTES = 720

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

function isDueForSync(settings: any, now: Date): boolean {
  if (!settings.last_auto_sync_at) return true

  const minutesSinceLastSync =
    (now.getTime() - new Date(settings.last_auto_sync_at).getTime()) / (1000 * 60)

  // subscription_tier is the source of truth; sync_frequency_minutes is a
  // denormalised copy maintained by a trigger and only used as a fallback.
  const syncFrequency =
    settings.subscription_tier === 'paid'
      ? PAID_TIER_SYNC_MINUTES
      : settings.sync_frequency_minutes || DEFAULT_FREE_TIER_SYNC_MINUTES

  return minutesSinceLastSync >= syncFrequency
}

/**
 * Shared sync logic used by both GET (Vercel cron) and POST (manual trigger)
 */
async function runCronSync(startTime: number) {
  try {
    // Service-role client: this sweep legitimately spans every user, and each
    // query below is explicitly scoped to the user being processed.
    const supabase = createServiceClient()

    const { data: allSettings, error: settingsError } = await supabase
      .from('user_settings')
      .select('*')
      .eq('auto_sync_enabled', true)

    if (settingsError) {
      console.error('Failed to fetch user settings:', settingsError)
      return NextResponse.json(
        { error: 'Failed to fetch user settings', details: settingsError.message },
        { status: 500 }
      )
    }

    if (!allSettings || allSettings.length === 0) {
      return NextResponse.json({
        message: 'No users with auto-sync enabled',
        processed: 0,
        skipped: 0,
        duration_ms: Date.now() - startTime,
      })
    }

    const now = new Date()
    const usersToSync = (allSettings as any[]).filter((settings) => isDueForSync(settings, now))

    if (usersToSync.length === 0) {
      return NextResponse.json({
        message: 'No users due for sync',
        total_users: allSettings.length,
        processed: 0,
        skipped: allSettings.length,
        duration_ms: Date.now() - startTime,
      })
    }

    const results = []
    let totalDocumentsFound = 0
    let totalDuplicatesSkipped = 0

    for (const userSettings of usersToSync) {
      const userStartTime = Date.now()
      const userId = userSettings.user_id

      try {
        const { data: gmailAccount, error: gmailError } = await supabase
          .from('gmail_accounts')
          .select('*')
          .eq('user_id', userId)
          .maybeSingle()

        if (gmailError || !gmailAccount) {
          results.push({
            userId,
            error: 'No Gmail account found',
            duration_ms: Date.now() - userStartTime,
          })
          continue
        }

        const account = gmailAccount as any

        // Stored tokens are encrypted; this decrypts, refreshes if needed and
        // persists any refreshed token encrypted.
        const accessToken = await getValidGmailAccessToken(supabase, account)

        const { data: syncJob } = await supabase
          .from('sync_jobs')
          // @ts-ignore - Supabase row types infer as never across this project
          .insert({
            user_id: userId,
            gmail_account_id: account.id,
            status: 'running',
            sync_from_date: new Date(
              Date.now() - userSettings.sync_days_back * 24 * 60 * 60 * 1000
            ).toISOString(),
            sync_to_date: new Date().toISOString(),
          })
          .select()
          .single()

        if (!syncJob) {
          results.push({
            userId,
            error: 'Failed to create sync job',
            duration_ms: Date.now() - userStartTime,
          })
          continue
        }

        // The one and only ingestion pipeline — identical to /api/sync.
        const { emailsScanned, documentsFound, duplicatesSkipped, newDocuments } =
          await runUserSync({
            supabase,
            user: { id: userId },
            settings: userSettings,
            gmailAccount: account,
            providerToken: accessToken,
          })

        await supabase
          .from('sync_jobs')
          // @ts-ignore - Supabase row types infer as never across this project
          .update({
            status: 'completed',
            emails_scanned: emailsScanned,
            documents_found: documentsFound,
            duplicates_skipped: duplicatesSkipped,
            completed_at: new Date().toISOString(),
          })
          .eq('id', (syncJob as any).id)
          .eq('user_id', userId)

        await supabase
          .from('user_settings')
          // @ts-ignore - Supabase row types infer as never across this project
          .update({ last_auto_sync_at: new Date().toISOString() })
          .eq('user_id', userId)

        // Covers this run's documents plus any an earlier run saved but failed
        // to notify about (timeout, Resend error).
        const notification = await notifyPendingDocuments(
          supabase,
          userId,
          userSettings,
          newDocuments.map((d) => d.id)
        )
        if (!notification.sent && notification.count > 0) {
          console.error(
            `Notification not sent for user ${userId} (${notification.count} documents): ${notification.reason}`
          )
        }
        const emailSent = notification.sent

        totalDocumentsFound += documentsFound
        totalDuplicatesSkipped += duplicatesSkipped

        results.push({
          userId,
          tier: userSettings.subscription_tier || 'free',
          documentsFound,
          duplicatesSkipped,
          emailSent,
          duration_ms: Date.now() - userStartTime,
        })
      } catch (error) {
        // One user's failure must never abort the sweep for everyone else.
        console.error(`Error syncing user ${userId}:`, error)

        // Documents saved before the failure are committed; tell the user
        // about them now rather than waiting for their next scheduled sync.
        await notifyPendingDocuments(supabase, userId, userSettings).catch((notifyError) =>
          console.error(`Notification after failed sync for user ${userId} failed:`, notifyError)
        )

        results.push({
          userId,
          error: error instanceof Error ? error.message : 'Unknown error',
          duration_ms: Date.now() - userStartTime,
        })
      }
    }

    return NextResponse.json({
      success: true,
      total_users: allSettings.length,
      processed: usersToSync.length,
      skipped: allSettings.length - usersToSync.length,
      total_documents_found: totalDocumentsFound,
      total_duplicates_skipped: totalDuplicatesSkipped,
      duration_ms: Date.now() - startTime,
      results,
    })
  } catch (error) {
    console.error('Cron sync failed:', error)
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

/**
 * Validate cron secret using constant-time comparison to prevent timing attacks
 */
function validateCronSecret(authHeader: string | null): boolean {
  const cronSecret = process.env.CRON_SECRET

  // Reject if CRON_SECRET is not configured or empty
  if (!cronSecret || cronSecret.trim() === '') {
    console.error('CRON_SECRET is not configured')
    return false
  }

  // Reject if no auth header provided
  if (!authHeader) {
    return false
  }

  // Extract token from "Bearer <token>" format
  const expectedHeader = `Bearer ${cronSecret}`

  // Use constant-time comparison to prevent timing attacks
  // Ensure both strings are same length for timingSafeEqual
  if (authHeader.length !== expectedHeader.length) {
    return false
  }

  try {
    return timingSafeEqual(
      Buffer.from(authHeader, 'utf8'),
      Buffer.from(expectedHeader, 'utf8')
    )
  } catch {
    return false
  }
}

/**
 * GET endpoint - Called by Vercel Cron
 * Vercel cron jobs send GET requests, so this is the main entry point for automated syncs.
 */
export async function GET(request: Request) {
  const startTime = Date.now()

  try {
    const authHeader = request.headers.get('authorization')
    if (!validateCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return await runCronSync(startTime)
  } catch (error) {
    console.error('Cron sync (GET) failed:', error)
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}

/**
 * POST endpoint - For manual triggers or external cron services
 * Can be used for testing or by services that prefer POST requests.
 */
export async function POST(request: Request) {
  const startTime = Date.now()

  try {
    const authHeader = request.headers.get('authorization')
    if (!validateCronSecret(authHeader)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    return await runCronSync(startTime)
  } catch (error) {
    console.error('Cron sync (POST) failed:', error)
    return NextResponse.json(
      {
        error: 'Cron job failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        duration_ms: Date.now() - startTime,
      },
      { status: 500 }
    )
  }
}
