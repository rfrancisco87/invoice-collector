/**
 * Create the first admin account.
 *
 * Signup is invite-only and invites can only be issued by an existing admin,
 * so a fresh installation has no way in. This script breaks that cycle. It is
 * also the correct tool for promoting an existing user to admin.
 *
 * It creates every row a working account needs — the same set the signup route
 * creates — because a partial account cannot log in and cannot be repaired
 * through the UI:
 *
 *   auth.users      the identity every table foreign-keys to
 *   profiles        created by the handle_new_user() trigger, then promoted
 *   app_credentials the scrypt password hash the login route checks
 *   user_settings   defaults row; without it every settings read 404s
 *
 * Usage:
 *   npx tsx scripts/create-admin.ts <email> <password>
 *
 * Re-running for an existing email promotes that account to admin and resets
 * its password, which is also the password-recovery path of last resort.
 */

const { adminClient, loadEnvLocal } = require('./_supabase')
const { hashPassword } = require('../lib/password')

async function main() {
    loadEnvLocal()

    const [email, password] = process.argv.slice(2)

    if (!email || !password) {
        console.error('Usage: npx tsx scripts/create-admin.ts <email> <password>')
        process.exit(1)
    }

    const normalisedEmail = email.trim().toLowerCase()

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalisedEmail)) {
        console.error('That does not look like an email address.')
        process.exit(1)
    }

    // Matches the policy the signup route enforces, so an account made here
    // cannot have a weaker password than one made through the UI.
    if (password.length < 10) {
        console.error('Password must be at least 10 characters.')
        process.exit(1)
    }

    const supabase = adminClient()

    // --- Find or create the auth user ---------------------------------------

    let userId: string | null = null

    const { data: existingProfile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', normalisedEmail)
        .maybeSingle()

    if (existingProfile) {
        userId = existingProfile.id
        console.log(`Existing account found (${userId}) — promoting to admin and resetting password.`)
    } else {
        const { data: created, error: createError } = await supabase.auth.admin.createUser({
            email: normalisedEmail,
            email_confirm: true,
        })

        if (createError || !created?.user) {
            console.error('Failed to create auth user:', createError?.message)
            process.exit(1)
        }

        userId = created.user.id
        console.log(`Created auth user ${userId}`)
    }

    // --- Profile -------------------------------------------------------------

    // handle_new_user() should have created this already; upsert covers the
    // case where the trigger is missing from an older database.
    const { error: profileError } = await supabase.from('profiles').upsert(
        {
            id: userId,
            email: normalisedEmail,
            role: 'admin',
            status: 'active',
        },
        { onConflict: 'id' }
    )

    if (profileError) {
        console.error('Failed to upsert profile:', profileError.message)
        process.exit(1)
    }
    console.log('Profile set to role=admin, status=active')

    // --- Credentials ---------------------------------------------------------

    const { error: credentialError } = await supabase.from('app_credentials').upsert(
        {
            profile_id: userId,
            password_hash: hashPassword(password),
            updated_at: new Date().toISOString(),
        },
        { onConflict: 'profile_id' }
    )

    if (credentialError) {
        console.error('Failed to set credentials:', credentialError.message)
        process.exit(1)
    }
    console.log('Password set')

    // --- Settings ------------------------------------------------------------

    const { error: settingsError } = await supabase
        .from('user_settings')
        .upsert({ user_id: userId }, { onConflict: 'user_id' })

    if (settingsError) {
        console.error('Failed to create user settings:', settingsError.message)
        process.exit(1)
    }
    console.log('Settings row ready')

    console.log(`\nDone. Log in at /login as ${normalisedEmail}`)
    console.log('Issue invites for everyone else from /admin.')
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
