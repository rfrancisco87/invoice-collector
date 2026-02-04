
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

async function fixStuckJobs() {
    console.log('Verifying Admin Access...')

    const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers()

    if (usersError) {
        console.error('FATAL: Cannot access auth.admin. Service Key might be invalid or permissions denied.', usersError)
        console.error('Error detail:', JSON.stringify(usersError, null, 2))
        return
    }

    console.log(`Admin access verified. Found ${usersData.users.length} users.`)

    console.log('Fetching latest 5 sync jobs...')
    const { data: jobs, error } = await supabase
        .from('sync_jobs')
        .select('*')
        .order('started_at', { ascending: false })
        .limit(5)

    if (error) {
        console.error('Error fetching jobs:', error)
        return
    }

    console.log(`Found ${jobs.length} recent jobs.`)
    if (jobs.length > 0) {
        console.log('Latest job:', jobs[0])

        // Fix specific stuck job logic
        const runningJobs = jobs.filter(j => j.status === 'running')
        for (const job of runningJobs) {
            console.log(`Fixing stuck job ${job.id}`)
            await supabase.from('sync_jobs').update({ status: 'failed', completed_at: new Date().toISOString() }).eq('id', job.id)
        }
    } else {
        console.log('Sync Jobs table appears empty.')
    }
}

fixStuckJobs()
