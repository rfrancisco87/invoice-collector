import { createClient } from '@supabase/supabase-js'
import { randomBytes, randomUUID, scryptSync } from 'crypto'

function hashPassword(password) {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${hash}`
}

async function main() {
  const email = process.argv[2]?.trim().toLowerCase()
  const password = process.argv[3]
  const fullName = process.argv[4] || null

  if (!email || !password) {
    console.error('Usage: node scripts/set-app-password.mjs <email> <password> [full_name]')
    process.exit(1)
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !serviceRoleKey) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  })

  const { data: existingProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email)
    .maybeSingle()

  const profileId = existingProfile?.id || randomUUID()

  const profilePayload = {
    id: profileId,
    email,
    full_name: fullName,
    role: 'admin',
    updated_at: new Date().toISOString(),
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert(profilePayload, { onConflict: 'id' })

  if (profileError) {
    console.error('Failed to upsert profile:', profileError.message)
    process.exit(1)
  }

  const passwordHash = hashPassword(password)
  const { error: credentialError } = await supabase
    .from('app_credentials')
    .upsert(
      {
        profile_id: profileId,
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'profile_id' }
    )

  if (credentialError) {
    console.error('Failed to upsert credentials:', credentialError.message)
    process.exit(1)
  }

  console.log(`Password configured for ${email}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
