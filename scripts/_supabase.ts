/**
 * Shared Supabase admin client for the maintenance scripts.
 *
 * These scripts previously each carried a hardcoded service_role key, which
 * put a full-database credential into version control. Credentials now come
 * from the environment only — .env.local is read as a convenience so the
 * scripts still run with a bare `npx tsx scripts/<name>.ts`.
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

/**
 * Populate process.env from .env.local for any key not already set.
 * Real environment variables always win, so CI/production usage is unaffected.
 */
function loadEnvLocal() {
    const envPath = path.resolve(__dirname, '..', '.env.local')
    if (!fs.existsSync(envPath)) return

    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue

        const separator = trimmed.indexOf('=')
        if (separator === -1) continue

        const key = trimmed.slice(0, separator).trim()
        let value = trimmed.slice(separator + 1).trim()

        // Strip surrounding quotes if present
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1)
        }

        if (!(key in process.env)) process.env[key] = value
    }
}

function requireEnv(name: string): string {
    const value = process.env[name]
    if (!value || !value.trim()) {
        console.error(
            `Missing ${name}. Set it in .env.local or export it before running this script.`
        )
        process.exit(1)
    }
    return value
}

/**
 * Service-role client. Bypasses RLS — scripts only, never imported by the app.
 */
function adminClient() {
    loadEnvLocal()

    return createClient(
        requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
        requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
        { auth: { persistSession: false, autoRefreshToken: false } }
    )
}

module.exports = { adminClient, loadEnvLocal, requireEnv }
