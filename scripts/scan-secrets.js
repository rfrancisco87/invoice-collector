/**
 * Secret scan for tracked and staged content.
 *
 * A service-role key once reached a public commit here, so "don't paste
 * credentials into files" is enforced rather than remembered. This is a
 * pattern matcher, not a guarantee: it catches the credential shapes this
 * project actually uses, and known test fixtures are allowlisted by exact
 * value so documentation and verification scripts stay green.
 *
 * Usage:
 *   node scripts/scan-secrets.js           # every tracked file
 *   node scripts/scan-secrets.js --staged  # only staged changes (pre-commit)
 *
 * Exits non-zero when a match survives the allowlist.
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

/** Credential shapes worth failing a commit over. */
const PATTERNS = [
    {
        name: 'Supabase JWT (anon or service_role)',
        // Three base64url segments; the length floor skips truncated docs
        // placeholders like `eyJhbGc...`.
        regex: /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{30,}\.[A-Za-z0-9_-]{20,}/g,
    },
    { name: 'Supabase secret key', regex: /sb_secret_[A-Za-z0-9_-]{20,}/g },
    { name: 'Supabase access token', regex: /sbp_[a-f0-9]{40,}/g },
    { name: 'Google OAuth client secret', regex: /GOCSPX-[A-Za-z0-9_-]{20,}/g },
    { name: 'Google API key', regex: /AIza[0-9A-Za-z_-]{35}/g },
    { name: 'Anthropic API key', regex: /sk-ant-api03-[A-Za-z0-9_-]{40,}/g },
    { name: 'OpenAI API key', regex: /sk-(?:proj-)?[A-Za-z0-9]{40,}/g },
    { name: 'Webhook signing secret', regex: /whsec_[A-Za-z0-9+/=_-]{16,}/g },
    { name: 'Resend API key', regex: /re_[A-Za-z0-9_-]{20,}/g },
]

/**
 * Values that look like credentials but are public fixtures. Exact matches
 * only — a real secret never gets waved through by resembling one of these.
 */
const ALLOWED = new Set([
    // Published Svix test vector, used by scripts/verify-webhook-signature.ts
    'whsec_MfKQ9r8GKYqrTwjUPD8ILPZIo2LaLaSw',
    // Obvious placeholder in scripts/verify-crypto.ts
    'sk-ant-api03-ThisIsNotARealKey_1234567890abcdefXYZ',
])

/** Paths that never hold project source. */
const SKIP_DIRS = new Set(['node_modules', '.next', '.git', 'dist', 'build', 'coverage'])
const SKIP_FILES = new Set(['scripts/scan-secrets.js', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock'])
const SKIP_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.pdf', '.woff', '.woff2', '.ttf'])

function git(args) {
    return execFileSync('git', args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
}

function shouldSkip(file) {
    if (SKIP_FILES.has(file)) return true
    if (SKIP_EXT.has(path.extname(file).toLowerCase())) return true
    return file.split('/').some((segment) => SKIP_DIRS.has(segment))
}

/** [{ file, content }] for whichever mode we are running in. */
function collectSources(staged) {
    const listing = staged
        ? git(['diff', '--cached', '--name-only', '--diff-filter=ACMR'])
        : git(['ls-files'])

    const files = listing.split('\n').filter(Boolean).filter((f) => !shouldSkip(f))

    return files
        .map((file) => {
            try {
                // Staged mode reads the index, not the worktree: what is about
                // to be committed is what matters.
                const content = staged
                    ? git(['show', `:${file}`])
                    : fs.readFileSync(file, 'utf8')
                return { file, content }
            } catch {
                return null // binary, deleted, or unreadable
            }
        })
        .filter(Boolean)
}

function findings(sources) {
    const hits = []

    for (const { file, content } of sources) {
        const lines = content.split('\n')

        lines.forEach((line, index) => {
            for (const { name, regex } of PATTERNS) {
                regex.lastIndex = 0
                for (const match of line.matchAll(regex)) {
                    const value = match[0]
                    if (ALLOWED.has(value)) continue
                    hits.push({
                        file,
                        line: index + 1,
                        name,
                        preview: `${value.slice(0, 12)}...${value.slice(-4)}`,
                    })
                }
            }
        })
    }

    return hits
}

const staged = process.argv.includes('--staged')
const hits = findings(collectSources(staged))

if (hits.length === 0) {
    console.log(`No secrets found in ${staged ? 'staged changes' : 'tracked files'}.`)
    process.exit(0)
}

console.error(`\n${hits.length} possible secret(s) found:\n`)
for (const hit of hits) {
    console.error(`  ${hit.file}:${hit.line}  ${hit.name}  ${hit.preview}`)
}
console.error(
    '\nMove the value to an environment variable. If this is a public test ' +
        'fixture, add it to ALLOWED in scripts/scan-secrets.js.\n'
)
process.exit(1)
