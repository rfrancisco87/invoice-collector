/**
 * Encrypt Google OAuth tokens still stored in plaintext in gmail_accounts.
 *
 * Tokens written before lib/gmail-tokens.ts existed are plaintext. The app
 * reads both forms, and each refresh re-writes an account encrypted, but the
 * refresh token of an idle account would otherwise sit in plaintext forever —
 * and it is the long-lived credential that matters. Run this once after
 * deploying, with the same ENCRYPTION_KEY the app uses.
 *
 * Idempotent: already-encrypted values are left untouched, so re-running is
 * safe. Each row is updated only if its tokens are unchanged since they were
 * read, so a refresh racing the backfill is never overwritten with stale data.
 *
 * Usage:  npx tsx scripts/encrypt-gmail-tokens.ts [--apply]
 *         (defaults to a dry run; pass --apply to write)
 */

const { adminClient, loadEnvLocal } = require('./_supabase')

import { decryptToken, encryptToken, isEncryptedToken } from '../lib/gmail-tokens'
import { isEncryptionConfigured } from '../lib/crypto'

interface Row {
    id: string
    user_id: string
    access_token: string | null
    refresh_token: string | null
}

async function main() {
    loadEnvLocal()

    if (!isEncryptionConfigured()) {
        console.error('ENCRYPTION_KEY is not set. It must be the same key the app runs with.')
        process.exit(1)
    }

    const apply = process.argv.includes('--apply')
    const supabase = adminClient()

    const { data, error } = await supabase
        .from('gmail_accounts')
        .select('id, user_id, access_token, refresh_token')

    if (error) {
        console.error('Failed to read gmail_accounts:', error.message)
        process.exit(1)
    }

    const rows: Row[] = data ?? []
    const pending = rows.filter(
        (row) =>
            (row.access_token && !isEncryptedToken(row.access_token)) ||
            (row.refresh_token && !isEncryptedToken(row.refresh_token))
    )

    // Catch a wrong ENCRYPTION_KEY before writing anything: rows already
    // encrypted under a different key would mean the app can't read either set.
    let undecryptable = 0
    for (const row of rows) {
        for (const value of [row.access_token, row.refresh_token]) {
            if (!isEncryptedToken(value)) continue
            try {
                decryptToken(value)
            } catch {
                undecryptable++
            }
        }
    }
    if (undecryptable > 0) {
        console.error(
            `${undecryptable} already-encrypted token(s) do not decrypt with this ENCRYPTION_KEY. ` +
                'Refusing to continue — check the key matches the app.'
        )
        process.exit(1)
    }

    console.log(`${rows.length} account(s), ${pending.length} with plaintext tokens.`)
    for (const row of pending) {
        // Ids only — never print token material.
        console.log(`  - account ${row.id} (user ${row.user_id})`)
    }

    if (pending.length === 0) return

    if (!apply) {
        console.log('\nDry run. Re-run with --apply to encrypt these rows.')
        return
    }

    let updated = 0
    let skipped = 0

    for (const row of pending) {
        const update: Record<string, string> = {}
        if (row.access_token) update.access_token = encryptToken(row.access_token)
        if (row.refresh_token) update.refresh_token = encryptToken(row.refresh_token)

        let query = supabase
            .from('gmail_accounts')
            .update(update)
            .eq('id', row.id)
            .eq('user_id', row.user_id)

        // Compare-and-set on the values we read.
        query = row.access_token ? query.eq('access_token', row.access_token) : query.is('access_token', null)
        query = row.refresh_token ? query.eq('refresh_token', row.refresh_token) : query.is('refresh_token', null)

        const { data: written, error: updateError } = await query.select('id')

        if (updateError) {
            console.error(`  ! account ${row.id}: ${updateError.message}`)
            process.exitCode = 1
        } else if (!written || written.length === 0) {
            // Changed underneath us (most likely a refresh, which already
            // re-encrypted it). A re-run will pick up anything still plaintext.
            skipped++
        } else {
            updated++
        }
    }

    console.log(`\nEncrypted ${updated} account(s); ${skipped} changed concurrently and were skipped.`)
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
