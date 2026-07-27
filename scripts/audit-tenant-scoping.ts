/**
 * Tenant-scoping regression check.
 *
 * Every server-side Supabase client in this app is a service-role client, so
 * Row-Level Security never fires and isolation rests entirely on each query
 * carrying its own `user_id` filter. One forgotten filter is a cross-tenant
 * leak, and that is not something to rediscover by reading diffs.
 *
 * This scans for `.from('<owned table>')` calls and flags any whose statement
 * does not constrain the owner column. It is a heuristic, not a type system:
 * it reads the chained statement following each `.from(...)` and looks for an
 * owner-column filter. Prefer lib/supabase/scoped.ts, which the check
 * recognises and which makes the filter impossible to omit.
 *
 * Usage:  npx tsx scripts/audit-tenant-scoping.ts
 * Exits non-zero when unscoped access is found, so it can gate CI.
 */

const fs = require('fs')
const path = require('path')

/** Tables whose rows belong to a specific user, and the column that says so. */
const OWNED_TABLES: Record<string, string> = {
    documents: 'user_id',
    user_settings: 'user_id',
    gmail_accounts: 'user_id',
    sync_jobs: 'user_id',
    user_feedback: 'user_id',
    sender_reputation: 'user_id',
    profiles: 'id',
}

/**
 * Files that legitimately query across users, with the reason. These resolve
 * the target user from something other than a session (a cron sweep over all
 * users, a signed webhook carrying a routing address) and are reviewed by hand.
 */
const ALLOWLIST: Record<string, string> = {
    'app/api/cron/sync/route.ts': 'sweeps every user with auto-sync enabled',
    'app/api/inbound-email/route.ts': 'resolves the user from a signed webhook payload',
    'app/api/auth/login/route.ts': 'looks up a profile by email before a session exists',
    'app/api/auth/signup/route.ts': 'checks email availability before an account exists',
    'app/api/admin/invites/route.ts': 'admin-only; checks whether an invited email is already taken',
    'app/(admin)/admin/page.tsx': 'admin dashboard, role-gated',
    'app/(admin)/layout.tsx': 'admin role check',
    'lib/auth.ts': 'resolves the session user by id',
    'lib/supabase/scoped.ts': 'defines the scoping helper',
}

const SEARCH_ROOTS = ['app', 'lib', 'components']

interface Finding {
    file: string
    line: number
    table: string
    snippet: string
}

function walk(dir: string, out: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name)
        if (entry.isDirectory()) {
            if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
            walk(full, out)
        } else if (/\.tsx?$/.test(entry.name)) {
            out.push(full)
        }
    }
    return out
}

/**
 * Extract the full statement starting at `.from(...)`.
 *
 * Bracket depth is tracked so a multi-line argument — `.update({ ... })` spread
 * over ten lines — does not end the statement early and hide the `.eq()` that
 * follows it. Once depth returns to zero, the chain continues only if the next
 * meaningful line is another `.method()` call.
 */
function statementAfter(lines: string[], startIndex: number): string {
    const collected: string[] = []
    let depth = 0

    for (let i = startIndex; i < Math.min(startIndex + 40, lines.length); i++) {
        const line = lines[i]
        collected.push(line)

        // Approximate: bracket characters inside string literals are rare
        // enough in query chains that counting them raw is good enough here.
        for (const char of line) {
            if (char === '(' || char === '{' || char === '[') depth++
            else if (char === ')' || char === '}' || char === ']') depth--
        }

        if (depth > 0) continue

        // Find the next line with content, skipping blanks and comments.
        let j = i + 1
        while (j < lines.length) {
            const candidate = lines[j].trim()
            if (candidate && !candidate.startsWith('//') && !candidate.startsWith('*')) break
            j++
        }

        const next = lines[j]?.trim() ?? ''
        if (!next.startsWith('.')) break
    }

    return collected.join('\n')
}

function audit(): Finding[] {
    const findings: Finding[] = []
    const repoRoot = path.resolve(__dirname, '..')

    for (const root of SEARCH_ROOTS) {
        const absRoot = path.join(repoRoot, root)
        if (!fs.existsSync(absRoot)) continue

        for (const file of walk(absRoot)) {
            const relative = path.relative(repoRoot, file)
            if (ALLOWLIST[relative]) continue

            const contents = fs.readFileSync(file, 'utf8')
            const lines = contents.split('\n')

            lines.forEach((line: string, index: number) => {
                const match = line.match(/\.from\(\s*['"`]([a-z_]+)['"`]\s*\)/)
                if (!match) return

                const table = match[1]
                const ownerColumn = OWNED_TABLES[table]
                if (!ownerColumn) return

                const statement = statementAfter(lines, index)

                // Accept an explicit filter on the owner column, in either
                // `.eq('user_id', ...)` form or as part of an inline payload.
                const ownerPattern = new RegExp(`['"\`]?${ownerColumn}['"\`]?\\s*[,:]`)
                if (ownerPattern.test(statement)) return

                // `.insert(payloadVariable)` — the owner column is set where the
                // variable is built, so resolve it before calling this a leak.
                const insertedVariable = statement.match(/\.insert\(\s*([A-Za-z_$][\w$]*)\s*\)/)
                if (insertedVariable) {
                    const name = insertedVariable[1]
                    const declaration = new RegExp(
                        `(?:const|let|var)\\s+${name}\\b[\\s\\S]{0,2000}?${ownerColumn}\\s*:`
                    )
                    if (declaration.test(contents)) return

                    // Also covers payloads populated after declaration, e.g.
                    // `payload.user_id = user.id`.
                    if (new RegExp(`${name}\\.${ownerColumn}\\s*=`).test(contents)) return
                }

                findings.push({
                    file: relative,
                    line: index + 1,
                    table,
                    snippet: line.trim(),
                })
            })
        }
    }

    return findings
}

const findings = audit()

if (findings.length === 0) {
    console.log('No unscoped access to user-owned tables found.')
    process.exit(0)
}

console.log(`Found ${findings.length} query/queries on user-owned tables without an owner filter:\n`)
for (const f of findings) {
    console.log(`  ${f.file}:${f.line}  [${f.table}]`)
    console.log(`    ${f.snippet}`)
}
console.log(
    '\nEither add the owner filter, route the query through lib/supabase/scoped.ts,' +
    '\nor add the file to ALLOWLIST in this script with a reason.'
)
process.exit(1)
