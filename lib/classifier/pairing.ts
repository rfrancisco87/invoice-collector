/**
 * Invoice/receipt pair detection.
 *
 * Stripe (and others) attach an invoice and a receipt for the same payment to
 * one email. Both are legitimate documents, but they describe a single
 * transaction and most Portuguese bookkeeping wants only the invoice.
 *
 * ## The asymmetry here is the opposite of the pre-filter's
 *
 * Pairing two documents means one of them gets discarded. So:
 *
 *   Wrongly pairing    → a genuinely separate invoice is deleted as a
 *                        "duplicate". A real document is lost.
 *   Wrongly not pairing → the user sees two rows and rejects one. Trivial.
 *
 * The pre-filter errs toward keeping things because skipping loses data; this
 * errs toward *not* pairing for exactly the same reason. Two invoices in one
 * email are never paired — only an invoice against a receipt — and even then a
 * positive corroborating signal is required. A shared sender and a shared email
 * are not enough on their own.
 */

export interface PairCandidate {
    id: string
    filename: string
    variant: string | null
    invoice_total: number | null
    supplier_name: string | null
    issue_date: string | null
    invoice_number: string | null
}

export interface DetectedPair {
    invoice: PairCandidate
    receipt: PairCandidate
    /** Which signal established the match, for the audit trail and the UI. */
    reason: string
}

/** Cent-level tolerance: totals come through as parsed floats. */
const TOTAL_TOLERANCE = 0.01

/**
 * Strip a leading document-type word and any extension, leaving the part that
 * identifies the transaction.
 *
 *   Invoice-1A2B3C4D.pdf → 1a2b3c4d
 *   Receipt_1A2B3C4D.pdf → 1a2b3c4d
 *
 * Stripe names its pairs exactly this way, which makes this the cheapest and
 * most reliable signal available — it needs no extracted fields at all, so it
 * works even when the classifier returned nothing.
 */
export function filenameStem(filename: string): string {
    return filename
        .replace(/\.[a-z0-9]+$/i, '')
        .replace(
            /^(?:invoice|receipt|fatura|factura|recibo|nota[\s\-_]*de[\s\-_]*cr[eé]dito)[\s\-_]*/i,
            '',
        )
        .replace(/[\s\-_]+/g, '')
        .toLowerCase()
}

function totalsMatch(a: PairCandidate, b: PairCandidate): boolean {
    if (a.invoice_total === null || b.invoice_total === null) return false
    // Two zero-total documents are not evidence of anything.
    if (a.invoice_total === 0 && b.invoice_total === 0) return false

    return Math.abs(a.invoice_total - b.invoice_total) <= TOTAL_TOLERANCE
}

function supplierAndDateMatch(a: PairCandidate, b: PairCandidate): boolean {
    if (!a.supplier_name || !b.supplier_name) return false
    if (!a.issue_date || !b.issue_date) return false

    return (
        a.supplier_name.trim().toLowerCase() === b.supplier_name.trim().toLowerCase() &&
        a.issue_date === b.issue_date
    )
}

function stemsMatch(a: PairCandidate, b: PairCandidate): boolean {
    const stemA = filenameStem(a.filename)
    const stemB = filenameStem(b.filename)

    // A short stem ("1", "01") collides by accident; require enough characters
    // for the match to mean something.
    if (stemA.length < 4) return false

    return stemA === stemB
}

/**
 * Find invoice/receipt pairs among the documents of a single email.
 *
 * Only ever pairs one invoice with one receipt. If an email contains two
 * invoices, or two receipts, nothing is paired — that is a case where being
 * wrong destroys data, so it is left to the user.
 */
export function detectPairs(candidates: PairCandidate[]): DetectedPair[] {
    const invoices = candidates.filter((c) => c.variant === 'invoice')
    const receipts = candidates.filter((c) => c.variant === 'receipt')

    if (invoices.length === 0 || receipts.length === 0) return []

    const pairs: DetectedPair[] = []
    const usedReceipts = new Set<string>()

    for (const invoice of invoices) {
        // Signals are tried strongest-first so the recorded reason names the
        // evidence that actually justified the pairing.
        const match = receipts.find((receipt) => {
            if (usedReceipts.has(receipt.id)) return false
            return stemsMatch(invoice, receipt) || totalsMatch(invoice, receipt) || supplierAndDateMatch(invoice, receipt)
        })

        if (!match) continue

        usedReceipts.add(match.id)

        const reason = stemsMatch(invoice, match)
            ? `Mesma referência no nome do ficheiro (${filenameStem(invoice.filename)})`
            : totalsMatch(invoice, match)
                ? `Mesmo total (${invoice.invoice_total})`
                : `Mesmo fornecedor e data (${invoice.supplier_name}, ${invoice.issue_date})`

        pairs.push({ invoice, receipt: match, reason })
    }

    return pairs
}

export type PairPreference = 'ask' | 'invoice' | 'receipt' | 'both'

export interface PairResolution {
    keepIds: string[]
    discardIds: string[]
    awaitingChoice: boolean
}

/**
 * Apply the user's standing preference to a detected pair.
 *
 * 'both' and 'ask' both discard nothing — 'both' is a settled decision to keep
 * everything, 'ask' defers. They differ only in whether the UI prompts.
 */
export function resolvePair(pair: DetectedPair, preference: PairPreference): PairResolution {
    switch (preference) {
        case 'invoice':
            return { keepIds: [pair.invoice.id], discardIds: [pair.receipt.id], awaitingChoice: false }
        case 'receipt':
            return { keepIds: [pair.receipt.id], discardIds: [pair.invoice.id], awaitingChoice: false }
        case 'both':
            return { keepIds: [pair.invoice.id, pair.receipt.id], discardIds: [], awaitingChoice: false }
        case 'ask':
        default:
            return { keepIds: [], discardIds: [], awaitingChoice: true }
    }
}
