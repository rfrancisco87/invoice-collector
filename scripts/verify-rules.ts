/**
 * Verification for lib/classifier/rules.ts.
 *
 * Two things being pinned here:
 *
 *   1. Matching and precedence behave as a user would predict — first matching
 *      rule by priority decides, and nothing later silently overrides it.
 *   2. User-supplied regexes cannot hang the server. A catastrophic pattern
 *      executed on every incoming document would take down the sync sweep.
 *
 * Usage:  npx tsx scripts/verify-rules.ts
 */

import {
    collectPromptHints,
    evaluateStage,
    ruleMatches,
    validatePattern,
    type ClassificationRule,
} from '../lib/classifier/rules'

let failures = 0

function check(name: string, condition: boolean, detail = '') {
    if (!condition) failures++
    console.log(`${condition ? 'PASS' : 'FAIL'}  ${name}${condition ? '' : `  ${detail}`}`)
}

function rule(overrides: Partial<ClassificationRule> & { id: string }): ClassificationRule {
    return {
        name: `rule-${overrides.id}`,
        enabled: true,
        priority: 100,
        stage: 'pre_filter',
        match_type: 'sender_domain',
        match_value: 'example.com',
        action: 'skip',
        ...overrides,
    }
}

const doc = {
    filename: 'Fatura_2024.pdf',
    subject: 'A sua fatura',
    sender: 'billing@example.com',
    senderDomain: 'example.com',
}

// --- Matching ---------------------------------------------------------------
check('sender_domain exact', ruleMatches(rule({ id: '1', match_value: 'example.com' }), doc))
check(
    'sender_domain subdomain',
    ruleMatches(rule({ id: '2', match_value: 'example.com' }), { ...doc, senderDomain: 'mail.example.com' })
)
check(
    'sender_domain does not match suffix collision',
    !ruleMatches(rule({ id: '3', match_value: 'example.com' }), { ...doc, senderDomain: 'notexample.com' })
)
check(
    'sender_domain tolerates leading @',
    ruleMatches(rule({ id: '4', match_value: '@example.com' }), doc)
)
check(
    'sender_email substring',
    ruleMatches(rule({ id: '5', match_type: 'sender_email', match_value: 'billing@' }), doc)
)
check(
    'subject_keyword case-insensitive',
    ruleMatches(rule({ id: '6', match_type: 'subject_keyword', match_value: 'FATURA' }), doc)
)
check(
    'filename_regex matches',
    ruleMatches(rule({ id: '7', match_type: 'filename_regex', match_value: '^Fatura_\\d{4}' }), doc)
)
check(
    'nl_instruction never matches',
    !ruleMatches(rule({ id: '8', match_type: 'nl_instruction', match_value: 'anything' }), doc)
)

// --- Precedence -------------------------------------------------------------
const ordered = [
    rule({ id: 'b', priority: 10, action: 'require_review' }),
    rule({ id: 'a', priority: 5, action: 'skip' }),
]
const evaluation = evaluateStage(ordered, 'pre_filter', doc)
check('lowest priority decides', evaluation.decision === 'skip', `got ${evaluation.decision}`)
check('all matches recorded', evaluation.applied.length === 2)

const disabled = evaluateStage(
    [rule({ id: 'c', enabled: false, action: 'skip' })],
    'pre_filter',
    doc
)
check('disabled rules ignored', disabled.decision === null)

const wrongStage = evaluateStage(
    [rule({ id: 'd', stage: 'post_decision', action: 'skip' })],
    'pre_filter',
    doc
)
check('other stages ignored', wrongStage.decision === null)

const hintOnly = evaluateStage(
    [rule({ id: 'e', action: 'hint' }), rule({ id: 'f', priority: 200, action: 'skip' })],
    'pre_filter',
    doc
)
check('hint is not decisive but skip still decides', hintOnly.decision === 'skip')
check('hint still recorded as applied', hintOnly.applied.length === 2)

// --- Prompt hints -----------------------------------------------------------
const hints = collectPromptHints([
    rule({
        id: 'g',
        stage: 'prompt_hint',
        match_type: 'nl_instruction',
        match_value: 'Documentos do meu contabilista nunca são faturas',
        action: 'hint',
    }),
    rule({ id: 'h', stage: 'pre_filter' }),
])
check('collects only prompt_hint instructions', hints.length === 1, JSON.stringify(hints))

// --- Pattern safety ---------------------------------------------------------
check('rejects nested quantifier (a+)+', validatePattern('(a+)+$').ok === false)
check('rejects nested quantifier (a*)*', validatePattern('(a*)*$').ok === false)
check('rejects nested {n,} quantifier', validatePattern('(a{2,})+').ok === false)
check('rejects invalid regex', validatePattern('([unclosed').ok === false)
check('rejects empty pattern', validatePattern('   ').ok === false)
check('rejects over-long pattern', validatePattern('a'.repeat(300)).ok === false)
check('accepts a reasonable pattern', validatePattern('^Fatura_\\d{4}-\\d+\\.pdf$').ok === true)

// A catastrophic pattern must not be evaluated even if it reaches matching.
const start = process.hrtime.bigint()
ruleMatches(
    rule({ id: 'redos', match_type: 'filename_regex', match_value: '(a+)+$' }),
    { ...doc, filename: 'a'.repeat(60) + '!' }
)
const elapsedMs = Number(process.hrtime.bigint() - start) / 1_000_000
check(`catastrophic pattern returns fast (${elapsedMs.toFixed(1)}ms)`, elapsedMs < 100)

// Long input against a benign pattern is also bounded.
const start2 = process.hrtime.bigint()
ruleMatches(
    rule({ id: 'long', match_type: 'filename_regex', match_value: '\\d+' }),
    { ...doc, filename: 'x'.repeat(50_000) }
)
const elapsedMs2 = Number(process.hrtime.bigint() - start2) / 1_000_000
check(`long input bounded (${elapsedMs2.toFixed(1)}ms)`, elapsedMs2 < 100)

console.log(failures === 0 ? '\nAll rule checks passed.' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
