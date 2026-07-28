/**
 * Layer A — deterministic pre-filter.
 *
 * Runs before the Drive upload and before any classifier call, on metadata we
 * already have: filename, subject, sender. Its job is to discard documents that
 * are obviously not invoices — bank statements, contracts, tickets, payslips —
 * so they never consume Drive quota, webhook calls, or (from Phase 4b) tokens,
 * and never appear in the user's pending list as a false positive.
 *
 * ## The asymmetry that shapes every rule here
 *
 * The two failure modes are not equally bad:
 *
 *   Skipping a real invoice  → the document is silently lost. The user does not
 *                              know to look for it. Potentially a missed
 *                              expense claim or tax deduction.
 *   Passing a non-invoice    → it lands in pending and the user clicks reject.
 *                              Mildly annoying, fully recoverable.
 *
 * So this filter is deliberately timid. A document is skipped only when a
 * negative pattern matches AND no positive invoice signal is present anywhere.
 * Any ambiguity resolves to "let it through and let the classifier decide".
 *
 * Vocabulary covers Portuguese and English, since that is what this app's
 * documents arrive in.
 */

export type PrefilterVerdict = 'pass' | 'skip'

export interface PrefilterInput {
    filename: string
    subject?: string | null
    sender?: string | null
    senderDomain?: string | null
}

export interface PrefilterResult {
    verdict: PrefilterVerdict
    /** Rule names that fired, for the audit trail and for debugging misses. */
    matched: {
        positive: string[]
        negative: string[]
    }
    /** Human-readable justification, stored on the document when it is skipped. */
    reason: string
}

interface Pattern {
    name: string
    test: RegExp
}

/**
 * Strong invoice signals. A single one of these vetoes every negative rule —
 * "Fatura anexa ao contrato" is a real invoice and must not be dropped by the
 * word "contrato".
 */
const POSITIVE_PATTERNS: Pattern[] = [
    { name: 'fatura', test: /\bfat(?:ura)?s?\b|\bfactura?s?\b/i },
    { name: 'invoice', test: /\binvoices?\b/i },
    // "Recibo" alone means receipt, but "recibo de vencimento" is a payslip.
    // The more specific phrase has to win, so it is excluded here rather than
    // relying on the negative rules — positives veto negatives by design.
    { name: 'recibo', test: /\brecibos?\b(?!\s*de\s*(?:vencimento|sal[aá]rio|ordenado))/i },
    { name: 'receipt', test: /\breceipts?\b/i },
    { name: 'nota_credito', test: /\bnota\s*(?:de\s*)?cr[eé]dito\b|\bcredit\s*notes?\b/i },
    { name: 'nota_debito', test: /\bnota\s*(?:de\s*)?d[eé]bito\b|\bdebit\s*notes?\b/i },
    // Portuguese fiscal document prefixes: FT (fatura), FR (fatura-recibo),
    // FS (fatura simplificada), NC (nota de crédito). Require a following
    // separator + digits so "ft" inside a word cannot match.
    { name: 'documento_fiscal', test: /\b(?:ft|fr|fs|nc|ns)[\s\-_/]?\d{2,}/i },
    { name: 'vat_iva', test: /\b(?:iva|vat)\b/i },
]

/**
 * Non-invoice document types. Each of these is a document class that regularly
 * arrives as a PDF attachment and is never an invoice.
 */
const NEGATIVE_PATTERNS: Pattern[] = [
    {
        name: 'bank_statement',
        test: /\bextracto?s?\b|\bextratos?\b|\bstatements?\b|\bbank\s*statement\b|\bmovimentos\b/i,
    },
    {
        name: 'contract',
        test: /\bcontratos?\b|\bcontracts?\b|\baditamentos?\b|\baddendum\b|\bnda\b/i,
    },
    {
        name: 'terms_policy',
        test: /\btermos?\s*(?:e\s*condi[cç][oõ]es)?\b|\bterms\s*(?:and|&)\s*conditions\b|\bpolitica\s*de\s*privacidade\b|\bprivacy\s*policy\b|\bap[oó]lices?\b|\bpolicy\s*document\b/i,
    },
    {
        name: 'payslip',
        test: /\brecibos?\s*de\s*vencimento\b|\bpayslips?\b|\bfolha\s*de\s*sal[aá]rio\b|\bsal[aá]rios?\b/i,
    },
    {
        name: 'travel_document',
        test: /\bboarding\s*pass\b|\bcart[aã]o\s*de\s*embarque\b|\bbilhetes?\b|\btickets?\b|\bitinerar(?:y|io)\b|\bitiner[aá]rio\b|\breserva\b|\bbooking\s*confirmation\b/i,
    },
    {
        name: 'report',
        test: /\brelat[oó]rios?\b|\breports?\b|\bapresenta[cç][aã]o\b|\bpresentations?\b|\bnewsletters?\b/i,
    },
    {
        name: 'personal_document',
        test: /\bcurriculums?\b|\bcurriculum\s*vitae\b|\bcvs?\b|\bcertificados?\b|\bcertificates?\b|\bdeclara[cç][aã]o\b/i,
    },
    {
        name: 'quote',
        // A quote/proposal is not yet a payable document. Kept separate from
        // contracts because users sometimes do want these — it is the most
        // likely rule to want disabling.
        test: /\bor[cç]amentos?\b|\bquotations?\b|\bquotes?\b|\bpropostas?\b|\bproposals?\b|\bpro-?forma\b/i,
    },
]

function collectMatches(patterns: Pattern[], haystack: string): string[] {
    return patterns.filter((pattern) => pattern.test.test(haystack)).map((p) => p.name)
}

const NEGATIVE_LABELS: Record<string, string> = {
    bank_statement: 'extrato bancário',
    contract: 'contrato',
    terms_policy: 'termos ou apólice',
    payslip: 'recibo de vencimento',
    travel_document: 'documento de viagem',
    report: 'relatório ou apresentação',
    personal_document: 'documento pessoal',
    quote: 'orçamento ou proposta',
}

/**
 * Decide whether a document is worth processing.
 *
 * Only the filename, subject and sender are consulted — this runs before the
 * file content is read by anything, which is the entire point.
 */
export function prefilterDocument(input: PrefilterInput): PrefilterResult {
    // Filename carries the strongest signal; subject and sender add context for
    // generically-named attachments ("document.pdf" in a "Your statement" mail).
    const haystack = [input.filename, input.subject ?? '', input.sender ?? '']
        .join(' ')
        // Separators are word boundaries in filenames: invoice_2024-01.pdf
        .replace(/[_\-.]+/g, ' ')

    const positive = collectMatches(POSITIVE_PATTERNS, haystack)
    const negative = collectMatches(NEGATIVE_PATTERNS, haystack)

    const matched = { positive, negative }

    // Any invoice signal wins. Documents legitimately mention contracts,
    // bookings and statements alongside a real invoice.
    if (positive.length > 0) {
        return {
            verdict: 'pass',
            matched,
            reason:
                negative.length > 0
                    ? `Sinais de fatura (${positive.join(', ')}) sobrepõem-se a ${negative.join(', ')}`
                    : `Sinais de fatura: ${positive.join(', ')}`,
        }
    }

    if (negative.length > 0) {
        const labels = negative.map((name) => NEGATIVE_LABELS[name] ?? name)
        return {
            verdict: 'skip',
            matched,
            reason: `Identificado como ${labels.join(' / ')} — não é uma fatura`,
        }
    }

    // No signal either way. Pass it on: the classifier is better placed to judge
    // content than a filename heuristic is, and a silent skip here would be the
    // expensive kind of mistake.
    return {
        verdict: 'pass',
        matched,
        reason: 'Sem sinais determinísticos — enviado para classificação',
    }
}
