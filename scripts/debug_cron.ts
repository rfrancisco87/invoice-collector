
import { createClient } from '@supabase/supabase-js'
import fs from 'fs'
import path from 'path'

// Load .env.local manually
try {
    const envPath = path.resolve(process.cwd(), '.env.local')
    console.log(`Loading env from ${envPath}`)
    const envFile = fs.readFileSync(envPath, 'utf8')
    envFile.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/)
        if (match) {
            const key = match[1].trim()
            const value = match[2].trim().replace(/^["']|["']$/g, '')
            process.env[key] = value
        }
    })
} catch (e) {
    console.error('Failed to load .env.local', e)
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function debugCron() {
    console.log('--- DEBUG CRON ELIGIBILITY ---')

    // 1. Fetch User Settings
    const { data: allSettings, error } = await supabase
        .from('user_settings')
        .select('*')

    if (error) {
        console.error('Error fetching settings:', error)
        return
    }

    console.log(`Found ${allSettings.length} user settings rows.`)

    const now = new Date()

    for (const settings of allSettings) {
        console.log(`\nUser: ${settings.user_id}`)
        console.log(`Auto Sync Enabled: ${settings.auto_sync_enabled}`)
        console.log(`Last Auto Sync: ${settings.last_auto_sync_at}`)
        console.log(`Sync Frequency: ${settings.sync_frequency_minutes} minutes`)

        if (!settings.auto_sync_enabled) {
            console.log('Result: SKIPPED (Auto-sync disabled)')
            continue
        }

        if (!settings.last_auto_sync_at) {
            console.log('Result: SHOULD SYNC (First time)')
            continue
        }

        const lastSync = new Date(settings.last_auto_sync_at)
        const minutesSince = (now.getTime() - lastSync.getTime()) / (1000 * 60)
        const freq = settings.sync_frequency_minutes || 720 // Default 12h

        console.log(`Minutes since last sync: ${minutesSince.toFixed(2)}`)
        console.log(`Required interval: ${freq}`)

        if (minutesSince >= freq) {
            console.log('Result: SHOULD SYNC (Due)')
        } else {
            console.log(`Result: SKIPPED (Not due yet. Wait ${(freq - minutesSince).toFixed(0)} mins)`)
        }
    }
}

debugCron()
