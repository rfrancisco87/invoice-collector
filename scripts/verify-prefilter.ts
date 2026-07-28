/**
 * Verification for lib/classifier/prefilter.ts.
 *
 * The pre-filter drops documents before they are ever stored, so a false skip
 * loses a real invoice with no trace. These cases pin the asymmetry: anything
 * ambiguous must pass.
 *
 * Usage:  npx tsx scripts/verify-prefilter.ts
 */

import { prefilterDocument } from '../lib/classifier/prefilter'

interface Case {
    name: string
    filename: string
    subject?: string
    sender?: string
    expect: 'pass' | 'skip'
}

const CASES: Case[] = [
    // --- Must pass: real invoices -------------------------------------------
    { name: 'PT invoice', filename: 'Fatura_FT2024-1234.pdf', expect: 'pass' },
    { name: 'PT invoice-receipt', filename: 'FR 2024_00123.pdf', expect: 'pass' },
    { name: 'EN invoice', filename: 'Invoice-4821.pdf', expect: 'pass' },
    { name: 'Stripe invoice', filename: 'Invoice-1A2B3C4D.pdf', expect: 'pass' },
    { name: 'Stripe receipt', filename: 'Receipt-1A2B3C4D.pdf', expect: 'pass' },
    { name: 'credit note', filename: 'Nota de Credito 55.pdf', expect: 'pass' },
    { name: 'old spelling factura', filename: 'factura_luz_janeiro.pdf', expect: 'pass' },
    { name: 'generic name, invoice subject', filename: 'document.pdf', subject: 'A sua fatura de janeiro', expect: 'pass' },

    // --- The asymmetry: invoice signal beats negative signal -----------------
    { name: 'invoice attached to contract', filename: 'Fatura_contrato_2024.pdf', expect: 'pass' },
    { name: 'invoice mentioning booking', filename: 'invoice_booking_9921.pdf', expect: 'pass' },
    { name: 'invoice in statement mail', filename: 'Fatura.pdf', subject: 'Extrato mensal e fatura', expect: 'pass' },

    // --- Unknown documents must pass, never skip ----------------------------
    { name: 'opaque filename', filename: 'document.pdf', expect: 'pass' },
    { name: 'scan filename', filename: 'scan_20240115_0001.pdf', expect: 'pass' },
    { name: 'random hash', filename: '8f3a9c1b.pdf', expect: 'pass' },
    { name: 'supplier name only', filename: 'EDP_janeiro.pdf', expect: 'pass' },

    // --- Must skip: unambiguous non-invoices ---------------------------------
    { name: 'bank statement PT', filename: 'Extrato_Conta_Janeiro.pdf', expect: 'skip' },
    { name: 'bank statement EN', filename: 'bank-statement-2024-01.pdf', expect: 'skip' },
    { name: 'contract', filename: 'Contrato_Prestacao_Servicos.pdf', expect: 'skip' },
    { name: 'NDA', filename: 'NDA_signed.pdf', expect: 'skip' },
    { name: 'payslip', filename: 'Recibo de Vencimento Janeiro.pdf', expect: 'skip' },
    { name: 'boarding pass', filename: 'boarding_pass_TP1234.pdf', expect: 'skip' },
    { name: 'terms', filename: 'Termos e Condicoes.pdf', expect: 'skip' },
    { name: 'insurance policy', filename: 'Apolice_Seguro_Auto.pdf', expect: 'skip' },
    { name: 'report', filename: 'Relatorio_Anual_2024.pdf', expect: 'skip' },
    { name: 'CV', filename: 'Curriculum_Vitae.pdf', expect: 'skip' },
    { name: 'quote', filename: 'Orcamento_1234.pdf', expect: 'skip' },
    { name: 'proforma', filename: 'proforma_invoice_draft.pdf', expect: 'pass' }, // "invoice" present → pass
]

let failures = 0

for (const testCase of CASES) {
    const result = prefilterDocument({
        filename: testCase.filename,
        subject: testCase.subject,
        sender: testCase.sender,
    })

    const ok = result.verdict === testCase.expect
    if (!ok) failures++

    console.log(
        `${ok ? 'PASS' : 'FAIL'}  ${testCase.name.padEnd(28)} ${testCase.filename.padEnd(36)} -> ${result.verdict}` +
        (ok ? '' : ` (expected ${testCase.expect})  [${result.reason}]`)
    )
}

console.log(
    failures === 0
        ? `\nAll ${CASES.length} pre-filter cases passed.`
        : `\n${failures}/${CASES.length} FAILED`
)

process.exit(failures === 0 ? 0 : 1)
