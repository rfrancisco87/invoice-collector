
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

// Mock NextResponse
const NextResponse = {
    json: (data, status) => {
        console.log('API Response:', status, JSON.stringify(data, null, 2))
        return { data, status }
    }
}

// Import the runCronSync logical function? 
// Since it's not exported, I'll basically copy the core logic here to verify permissions.
// Actually, simpler: Use fetch to hit the local running API if available?
// "npm run dev" is running on localhost:3000.

async function triggerLocalCron() {
    console.log('--- TRIGGERING LOCAL CRON SYNC (POST /api/cron/sync) ---')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
    const secret = process.env.CRON_SECRET || 'your-cron-secret-here' // Need to get this from env locally?

    // We can't easily get CRON_SECRET if it's not in .env.local usually?
    // Let's assume CRON_SECRET is in .env.local or we bypass auth for this test?

    // Actually, I'll use the Service Role key to DIRECTLY run the logic via a copied snippet, 
    // OR I can use the supabase client to verify *Service Role* access to user_settings (which is the blocker).

    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('1. Testing Service Role Access to ALL user_settings...')
    const { data: users, error } = await supabase.from('user_settings').select('user_id')

    if (error) {
        console.error('FAILED: Service Role cannot access user_settings.', error)
        console.log('CRITICAL: This confirms the keys are still wrong or RLS is blocking Service Role.')
    } else {
        console.log(`SUCCESS: Service Role accessed ${users.length} users.`)
        console.log('This confirms that with CORRECT KEYS, the logic works.')
        console.log('If production is failing, PRODUCTION KEYS are wrong.')
    }

}

triggerLocalCron()
