/**
 * User-defined classification rules.
 *
 * Layered onto the built-in pipeline rather than replacing it: the defaults
 * encode what an invoice generally looks like, rules encode what *this user's*
 * mail looks like.
 *
 * ## Untrusted input
 *
 * `filename_regex` rules are arbitrary patterns supplied by a user and then
 * executed on the server against every incoming document. A pattern like
 * `(a+)+$` backtracks exponentially and will hang the request handler — a
 * denial of service a user can inflict on themselves, and on a shared host, on
 * the sync sweep for everyone else. Patterns are therefore length-capped,
 * validated at save time, and executed against a truncated subject string, with
 * catastrophic constructs rejected outright.
 */

export type RuleStage = 'pre_filter' | 'prompt_hint' | 'post_decision'

export type RuleMatchType =
    | 'sender_domain'
    | 'sender_email'
    | 'filename_regex'
    | 'subject_keyword'
    | 'nl_instruction'

export type RuleAction =
    | 'skip'
    | 'force_invoice'
    | 'force_not_invoice'
    | 'require_review'
    | 'hint'

export interface ClassificationRule {
    id: string
    name: string
    enabled: boolean
    priority: number
    stage: RuleStage
    match_type: RuleMatchType
    match_value: string
    action: RuleAction
}

export interface RuleMatchInput {
    filename: string
    subject?: string | null
    sender?: string | null
    senderDomain?: string | null
}

export interface AppliedRule {
    id: string
    name: string
    action: RuleAction
}

/** Cap the text a user pattern runs against, bounding worst-case backtracking. */
const MAX_MATCH_INPUT_LENGTH = 300

/** Patterns longer than this are rejected at save time. */
export const MAX_PATTERN_LENGTH = 200

/**
 * Reject patterns with nested quantifiers — the shape behind catastrophic
 * backtracking, e.g. `(a+)+`, `(a*)*`, `(\d+|x)+`.
 *
 * This is a heuristic, not a proof of safety, which is why the input length cap
 * exists as well. Together they bound the damage: a linear-time cap on input
 * plus rejection of the constructs that make backtracking super-linear.
 */
const NESTED_QUANTIFIER = /(\([^)]*[+*]\s*\)\s*[+*])|(\([^)]*\{\d+,\}\s*\)\s*[+*{])/

export interface PatternValidation {
    ok: boolean
    error?: string
}

/**
 * Validate a user regex before it is stored. Called by the rules API so a bad
 * pattern is rejected at the point the user can still fix it, rather than
 * failing silently during a sync.
 */
export function validatePattern(pattern: string): PatternValidation {
    if (!pattern || !pattern.trim()) {
        return { ok: false, error: 'O padrão não pode estar vazio.' }
    }

    if (pattern.length > MAX_PATTERN_LENGTH) {
        return { ok: false, error: `O padrão não pode exceder ${MAX_PATTERN_LENGTH} caracteres.` }
    }

    if (NESTED_QUANTIFIER.test(pattern)) {
        return {
            ok: false,
            error:
                'O padrão contém quantificadores aninhados (por exemplo "(a+)+"), que podem bloquear o servidor. Simplifique-o.',
        }
    }

    try {
        new RegExp(pattern, 'i')
    } catch {
        return { ok: false, error: 'Expressão regular inválida.' }
    }

    return { ok: true }
}

function safeRegexTest(pattern: string, value: string): boolean {
    if (pattern.length > MAX_PATTERN_LENGTH) return false
    if (NESTED_QUANTIFIER.test(pattern)) return false

    try {
        // Truncated: bounds the work even for a pattern that slipped past the
        // heuristic above.
        return new RegExp(pattern, 'i').test(value.slice(0, MAX_MATCH_INPUT_LENGTH))
    } catch {
        return false
    }
}

function normaliseDomain(value: string): string {
    return value.trim().toLowerCase().replace(/^@/, '')
}

/** Does this rule match the document? `nl_instruction` never matches — it is prompt text. */
export function ruleMatches(rule: ClassificationRule, input: RuleMatchInput): boolean {
    const value = rule.match_value?.trim()
    if (!value) return false

    switch (rule.match_type) {
        case 'sender_domain': {
            const target = normaliseDomain(value)
            const actual = (input.senderDomain ?? '').trim().toLowerCase()
            if (!actual) return false
            // Subdomain match, so "example.com" also covers "mail.example.com".
            return actual === target || actual.endsWith(`.${target}`)
        }

        case 'sender_email':
            return (input.sender ?? '').trim().toLowerCase().includes(value.toLowerCase())

        case 'filename_regex':
            return safeRegexTest(value, input.filename)

        case 'subject_keyword': {
            const haystack = `${input.subject ?? ''} ${input.filename}`.toLowerCase()
            return haystack.includes(value.toLowerCase())
        }

        case 'nl_instruction':
        default:
            return false
    }
}

function sortRules(rules: ClassificationRule[]): ClassificationRule[] {
    // Priority first, id as a stable tiebreak so evaluation order is
    // deterministic across requests.
    return [...rules].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))
}

export interface StageEvaluation {
    /** Rules that matched, in evaluation order. */
    applied: AppliedRule[]
    /** The first decisive action, if any. Later rules cannot override it. */
    decision: RuleAction | null
    /** Name of the rule that decided, for the audit trail. */
    decidedBy: string | null
}

/**
 * Evaluate the rules for one stage.
 *
 * First match wins. A user who orders rules by priority expects the first
 * applicable one to decide, and letting later rules silently override would
 * make a rule list impossible to reason about.
 */
export function evaluateStage(
    rules: ClassificationRule[],
    stage: RuleStage,
    input: RuleMatchInput,
): StageEvaluation {
    const applied: AppliedRule[] = []
    let decision: RuleAction | null = null
    let decidedBy: string | null = null

    for (const rule of sortRules(rules)) {
        if (!rule.enabled || rule.stage !== stage) continue
        if (!ruleMatches(rule, input)) continue

        applied.push({ id: rule.id, name: rule.name, action: rule.action })

        if (decision === null && rule.action !== 'hint') {
            decision = rule.action
            decidedBy = rule.name
        }
    }

    return { applied, decision, decidedBy }
}

/**
 * Natural-language instructions for the classifier prompt.
 *
 * Returned verbatim as user-authored guidance. They are appended to the prompt
 * as clearly-labelled user preferences rather than merged into the system
 * instructions, so an instruction cannot quietly redefine what the classifier
 * considers an invoice for everyone.
 */
export function collectPromptHints(rules: ClassificationRule[]): string[] {
    return sortRules(rules)
        .filter(
            (rule) =>
                rule.enabled &&
                rule.stage === 'prompt_hint' &&
                rule.match_type === 'nl_instruction' &&
                rule.match_value?.trim(),
        )
        .map((rule) => rule.match_value.trim())
}
