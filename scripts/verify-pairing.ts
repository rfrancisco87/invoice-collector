/**
 * Verification for lib/classifier/pairing.ts.
 *
 * Pairing deletes one of the two documents, so a false pair destroys a real
 * invoice. These cases pin that two separate invoices are never merged and that
 * a shared email alone is not evidence.
 *
 * Usage:  npx tsx scripts/verify-pairing.ts
 */

import { detectPairs, filenameStem, resolvePair, type PairCandidate } from '../lib/classifier/pairing'

function doc(overrides: Partial<PairCandidate> & { id: string }): PairCandidate {
    return {
        filename: 'document.pdf',
        variant: 'other',
        invoice_total: null,
        supplier_name: null,
        issue_date: null,
        invoice_number: null,
        ...overrides,
    }
}

interface Case {
    name: string
    docs: PairCandidate[]
    expectPairs: number
}

const CASES: Case[] = [
    {
        name: 'Stripe: shared filename stem',
        docs: [
            doc({ id: 'a', filename: 'Invoice-1A2B3C4D.pdf', variant: 'invoice' }),
            doc({ id: 'b', filename: 'Receipt-1A2B3C4D.pdf', variant: 'receipt' }),
        ],
        expectPairs: 1,
    },
    {
        name: 'matching totals, different names',
        docs: [
            doc({ id: 'a', filename: 'fatura_jan.pdf', variant: 'invoice', invoice_total: 123.45 }),
            doc({ id: 'b', filename: 'comprovativo.pdf', variant: 'receipt', invoice_total: 123.45 }),
        ],
        expectPairs: 1,
    },
    {
        name: 'matching supplier and date',
        docs: [
            doc({ id: 'a', filename: 'a.pdf', variant: 'invoice', supplier_name: 'Stripe Inc', issue_date: '2026-01-15' }),
            doc({ id: 'b', filename: 'b.pdf', variant: 'receipt', supplier_name: 'stripe inc', issue_date: '2026-01-15' }),
        ],
        expectPairs: 1,
    },

    // --- Must NOT pair: pairing destroys data -------------------------------
    {
        name: 'two separate invoices (never pair)',
        docs: [
            doc({ id: 'a', filename: 'Invoice-111.pdf', variant: 'invoice', invoice_total: 50 }),
            doc({ id: 'b', filename: 'Invoice-222.pdf', variant: 'invoice', invoice_total: 50 }),
        ],
        expectPairs: 0,
    },
    {
        name: 'two receipts (never pair)',
        docs: [
            doc({ id: 'a', filename: 'Receipt-111.pdf', variant: 'receipt' }),
            doc({ id: 'b', filename: 'Receipt-222.pdf', variant: 'receipt' }),
        ],
        expectPairs: 0,
    },
    {
        name: 'invoice + receipt, no corroborating signal',
        docs: [
            doc({ id: 'a', filename: 'fatura_abc.pdf', variant: 'invoice', invoice_total: 100 }),
            doc({ id: 'b', filename: 'recibo_xyz.pdf', variant: 'receipt', invoice_total: 250 }),
        ],
        expectPairs: 0,
    },
    {
        name: 'both zero totals is not evidence',
        docs: [
            doc({ id: 'a', filename: 'a.pdf', variant: 'invoice', invoice_total: 0 }),
            doc({ id: 'b', filename: 'b.pdf', variant: 'receipt', invoice_total: 0 }),
        ],
        expectPairs: 0,
    },
    {
        name: 'short stems must not collide',
        docs: [
            doc({ id: 'a', filename: 'Invoice-1.pdf', variant: 'invoice' }),
            doc({ id: 'b', filename: 'Receipt-1.pdf', variant: 'receipt' }),
        ],
        expectPairs: 0,
    },
    {
        name: 'single document',
        docs: [doc({ id: 'a', filename: 'Invoice-1A2B3C4D.pdf', variant: 'invoice' })],
        expectPairs: 0,
    },
    {
        name: 'two pairs in one email',
        docs: [
            doc({ id: 'a', filename: 'Invoice-AAAA1111.pdf', variant: 'invoice' }),
            doc({ id: 'b', filename: 'Receipt-AAAA1111.pdf', variant: 'receipt' }),
            doc({ id: 'c', filename: 'Invoice-BBBB2222.pdf', variant: 'invoice' }),
            doc({ id: 'd', filename: 'Receipt-BBBB2222.pdf', variant: 'receipt' }),
        ],
        expectPairs: 2,
    },
]

let failures = 0

for (const testCase of CASES) {
    const pairs = detectPairs(testCase.docs)
    const ok = pairs.length === testCase.expectPairs
    if (!ok) failures++

    console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${testCase.name.padEnd(38)} -> ${pairs.length} pair(s)` +
        (ok ? '' : ` (expected ${testCase.expectPairs})`)
    )
}

// --- Stem extraction --------------------------------------------------------
const STEM_CASES: Array<[string, string]> = [
    ['Invoice-1A2B3C4D.pdf', '1a2b3c4d'],
    ['Receipt_1A2B3C4D.pdf', '1a2b3c4d'],
    ['Fatura-FT2024-001.pdf', 'ft2024001'],
    ['recibo 55.pdf', '55'],
]

for (const [input, expected] of STEM_CASES) {
    const actual = filenameStem(input)
    const ok = actual === expected
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  stem ${input.padEnd(32)} -> ${actual}${ok ? '' : ` (expected ${expected})`}`)
}

// --- Resolution -------------------------------------------------------------
const pair = detectPairs([
    doc({ id: 'inv', filename: 'Invoice-1A2B3C4D.pdf', variant: 'invoice' }),
    doc({ id: 'rec', filename: 'Receipt-1A2B3C4D.pdf', variant: 'receipt' }),
])[0]

const RESOLUTIONS: Array<[any, string[], string[], boolean]> = [
    ['invoice', ['inv'], ['rec'], false],
    ['receipt', ['rec'], ['inv'], false],
    ['both', ['inv', 'rec'], [], false],
    ['ask', [], [], true],
]

for (const [preference, keep, discard, awaiting] of RESOLUTIONS) {
    const result = resolvePair(pair, preference)
    const ok =
        JSON.stringify(result.keepIds) === JSON.stringify(keep) &&
        JSON.stringify(result.discardIds) === JSON.stringify(discard) &&
        result.awaitingChoice === awaiting
    if (!ok) failures++
    console.log(`${ok ? 'PASS' : 'FAIL'}  resolve "${preference}" -> keep=[${result.keepIds}] discard=[${result.discardIds}]`)
}

console.log(failures === 0 ? '\nAll pairing cases passed.' : `\n${failures} FAILURE(S)`)
process.exit(failures === 0 ? 0 : 1)
