import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'
import { runUserSync } from '@/lib/sync-runner'
import { notifyPendingDocuments } from '@/lib/notifications'

// A full sync can outlast the default timeout; dying mid-run saves documents
// without ever sending their notification.
export const maxDuration = 300

export async function POST(request: Request) {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized - no session' }, { status: 401 })
    }

    const supabase = await createClient()

    // Get user settings and Gmail account first
    const [settingsResult, gmailResult] = await Promise.all([
      supabase
        .from('user_settings')
        .select('*')
        .eq('user_id', user.id)
        .single(),
      supabase
        .from('gmail_accounts')
        .select('*')
        .eq('user_id', user.id)
        .single(),
    ])

    if (settingsResult.error || !settingsResult.data) {
      return NextResponse.json({ error: 'User settings not found', details: settingsResult.error?.message }, { status: 404 })
    }

    if (gmailResult.error || !gmailResult.data) {
      return NextResponse.json({ error: 'Gmail account not found', details: gmailResult.error?.message }, { status: 404 })
    }

    const settings = settingsResult.data
    const gmailAccount = gmailResult.data

    // Get valid access token (will refresh if needed)
    let providerToken: string
    try {
      // Stored tokens are encrypted; this decrypts, refreshes if needed and
      // persists any refreshed token encrypted.
      providerToken = await getValidGmailAccessToken(supabase, gmailAccount)
    } catch (error) {
      return NextResponse.json({
        error: 'Failed to get valid access token',
        details: error instanceof Error ? error.message : 'Please log out and log in again',
        debug: {
          hasAccessToken: !!gmailAccount.access_token,
          hasRefreshToken: !!gmailAccount.refresh_token,
          tokenExpiry: gmailAccount.token_expiry,
        }
      }, { status: 401 })
    }

    if (!settings.drive_folder_id) {
      return NextResponse.json(
        { error: 'Drive folder not configured' },
        { status: 400 }
      )
    }

    // SELF-HEALING: Check for and cleanup any stuck jobs for this user
    const { data: stuckJobs } = await supabase
      .from('sync_jobs')
      .select('id')
      .eq('user_id', user.id)
      .eq('status', 'running')

    if (stuckJobs && stuckJobs.length > 0) {
      console.log(`[SYNC] Found ${stuckJobs.length} stuck jobs. Cleaning up...`)
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error_message: 'Auto-cleanup: Job was stuck in running state',
          completed_at: new Date().toISOString()
        })
        .in('id', stuckJobs.map(j => j.id))
        .eq('user_id', user.id)
    }

    // Create sync job
    const { data: syncJob, error: syncJobError } = await supabase
      .from('sync_jobs')
      .insert({
        user_id: user.id,
        gmail_account_id: gmailAccount.id,
        status: 'running',
        sync_from_date: new Date(Date.now() - settings.sync_days_back * 24 * 60 * 60 * 1000).toISOString(),
        sync_to_date: new Date().toISOString(),
      })
      .select()
      .single()

    if (syncJobError || !syncJob) {
      return NextResponse.json({ error: 'Failed to create sync job' }, { status: 500 })
    }

    try {
      // All document work — Gmail scan, ingestion, labelling, archiving and the
      // Drive inbox pass — lives in lib/sync-runner.ts so that the cron sweep
      // runs byte-for-byte the same pipeline. See that module for why.
      const {
        emailsScanned,
        documentsFound,
        duplicatesSkipped,
        newDocuments,
        log: processingLog,
        gmailDebug,
      } = await runUserSync({
        supabase,
        user,
        settings,
        gmailAccount,
        providerToken,
      })

      processingLog.push(`\n=== PROCESSING COMPLETE ===`)
      processingLog.push(`Success: ${documentsFound}/${emailsScanned}`) // Corrected denominator from attachments.length to emailsScanned (which was set to attachments.length)

      // Update sync job to completed
      await supabase
        .from('sync_jobs')
        .update({
          status: 'completed',
          emails_scanned: emailsScanned,
          documents_found: documentsFound,
          duplicates_skipped: duplicatesSkipped,
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncJob.id)
        .eq('user_id', user.id)

      // Same path as the cron: also picks up documents an earlier run saved
      // but failed to notify about.
      const notification = await notifyPendingDocuments(
        supabase,
        user.id,
        settings,
        newDocuments.map((d) => d.id)
      )
      if (notification.sent) {
        processingLog.push(`✓ Notification email sent (${notification.count} documents)`)
      } else if (notification.count > 0) {
        processingLog.push(`⚠ Notification email not sent: ${notification.reason}`)
      }

      return NextResponse.json({
        success: true,
        emailsScanned,
        documentsFound,
        duplicatesSkipped,
        debug: gmailDebug
          ? {
            query: gmailDebug.query,
            daysBack: gmailDebug.daysBack,
            afterDate: gmailDebug.afterDate,
            messagesFound: gmailDebug.messagesFound,
            messagesWithoutDateFilter: gmailDebug.messagesWithoutDateFilter,
            pdfAttachmentsFound: gmailDebug.pdfAttachmentsFound,
          }
          : null,
        processingLog,
      })

    } catch (processError) {
      console.error('Fatal sync error:', processError)

      // Mark job as failed
      await supabase
        .from('sync_jobs')
        .update({
          status: 'failed',
          error_message: processError instanceof Error ? processError.message : String(processError),
          completed_at: new Date().toISOString(),
        })
        .eq('id', syncJob.id)
        .eq('user_id', user.id)

      throw processError // Re-throw to be caught by outer catch for response
    }

  } catch (error) {
    return NextResponse.json(
      {
        error: 'Failed to sync emails',
        details: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
