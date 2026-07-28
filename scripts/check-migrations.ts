/**
 * Report which of the multi-user / classification migrations are applied.
 *
 * These migrations are applied by hand in the Supabase SQL editor, so it is
 * easy to lose track — and a missing one surfaces as an opaque runtime 500
 * rather than anything that names the cause. This probes for the tables and
 * columns each migration adds and says plainly what is missing.
 *
 * Usage:  npx tsx scripts/check-migrations.ts
 */

const { adminClient } = require('./_supabase')

interface Probe {
    table: string
    /** Column to select. Omit to probe only that the table exists. */
    column?: string
}

interface MigrationCheck {
    file: string
    description: string
    probes: Probe[]
}

const MIGRATIONS: MigrationCheck[] = [
    {
        file: '019_multi_user_accounts.sql',
        description: 'Invite-only signup, password reset, account status',
        probes: [
            { table: 'invite_codes' },
            { table: 'password_reset_tokens' },
            { table: 'profiles', column: 'status' },
        ],
    },
    {
        file: '020_classification_metadata.sql',
        description: 'Confidence gate, classification reasons, pre-filter toggle',
        probes: [
            { table: 'documents', column: 'needs_review' },
            { table: 'documents', column: 'classification_reason' },
            { table: 'user_settings', column: 'prefilter_enabled' },
            { table: 'user_settings', column: 'classification_confidence_threshold' },
        ],
    },
    {
        file: '021_sibling_documents.sql',
        description: 'Invoice/receipt pairing',
        probes: [
            { table: 'documents', column: 'variant' },
            { table: 'documents', column: 'pair_state' },
            { table: 'user_settings', column: 'duplicate_pair_default' },
        ],
    },
    {
        file: '022_user_api_keys.sql',
        description: 'Per-user encrypted LLM API keys',
        probes: [
            { table: 'user_api_keys' },
            { table: 'user_settings', column: 'classifier_backend' },
        ],
    },
    {
        file: '023_llm_classification.sql',
        description: 'LLM classification model selection and usage tracking',
        probes: [
            { table: 'llm_usage' },
            { table: 'user_settings', column: 'classifier_model' },
            { table: 'documents', column: 'classification_model' },
        ],
    },
    {
        file: '024_classification_rules.sql',
        description: 'User-defined classification rules',
        probes: [
            { table: 'classification_rules' },
            { table: 'documents', column: 'rules_applied' },
        ],
    },
]

async function main() {
    const supabase = adminClient()
    const missing: string[] = []

    for (const migration of MIGRATIONS) {
        const failures: string[] = []

        for (const probe of migration.probes) {
            const { error } = await supabase
                .from(probe.table)
                .select(probe.column ?? '*')
                .limit(1)

            if (error) {
                failures.push(probe.column ? `${probe.table}.${probe.column}` : probe.table)
            }
        }

        if (failures.length === 0) {
            console.log(`APPLIED  ${migration.file}  — ${migration.description}`)
        } else {
            missing.push(migration.file)
            console.log(`MISSING  ${migration.file}  — ${migration.description}`)
            for (const failure of failures) {
                console.log(`         missing: ${failure}`)
            }
        }
    }

    console.log('')

    if (missing.length === 0) {
        console.log('All migrations applied.')
        return
    }

    console.log('Apply these in the Supabase SQL editor, in order:')
    for (const file of missing) {
        console.log(`  supabase/migrations/${file}`)
    }
    process.exitCode = 1
}

main().catch((err) => {
    console.error(err)
    process.exit(1)
})
