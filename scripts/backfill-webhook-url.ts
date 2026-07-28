/**
 * Backfill user_settings.webhook_url from the WEBHOOK_URL environment variable.
 *
 * The ingestion pipeline used to fall back to process.env.WEBHOOK_URL whenever a
 * user had no webhook_url of their own. That is fine for a single-user app and
 * wrong for a shared one: every new user would silently classify documents
 * through the owner's n8n instance, on the owner's quota and bill.
 *
 * The fallback has been removed from the code. Run this once, before deploying,
 * to pin existing users to what they were already effectively using. New users
 * then start with no classifier until they configure one, which is the intended
 * behaviour.
 *
 * Usage:  npx tsx scripts/backfill-webhook-url.ts [--apply]
 *         (defaults to a dry run; pass --apply to write)
 */

const { adminClient, loadEnvLocal } = require('./_supabase')

async function main() {
    loadEnvLocal()

    const webhookUrl = process.env.WEBHOOK_URL?.trim()
    if (!webhookUrl) {
        console.log('WEBHOOK_URL is not set — nothing to backfill. Exiting.')
        return
    }

    const apply = process.argv.includes('--apply')
    const supabase = adminClient()

    const { data: rows, error } = await supabase
        .from('user_settings')
        .select('user_id, webhook_url')
        .is('webhook_url', null)

    if (error) {
        console.error('Failed to read user_settings:', error.message)
        process.exit(1)
    }

    if (!rows || rows.length === 0) {
        console.log('No users are relying on the environment fallback. Nothing to do.')
        return
    }

    console.log(`${rows.length} user(s) have no webhook_url and would lose classification:`)
    for (const row of rows) {
        console.log(`  - ${row.user_id}`)
    }

    if (!apply) {
        console.log(`\nDry run. Re-run with --apply to set webhook_url = ${webhookUrl}`)
        return
    }

    const { error: updateError } = await supabase
        .from('user_settings')
        .update({ webhook_url: webhookUrl })
        .is('webhook_url', null)

    if (updateError) {
        console.error('Backfill failed:', updateError.message)
        process.exit(1)
    }

    console.log(`\nBackfilled ${rows.length} user(s) to ${webhookUrl}`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
