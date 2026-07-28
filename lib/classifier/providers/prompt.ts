/**
 * The classification contract, shared by every LLM provider.
 *
 * Keeping the prompt and schema in one place is what makes provider comparison
 * meaningful — if Anthropic and OpenAI were asked different questions, an
 * accuracy difference between them would say nothing about the models.
 */

/**
 * JSON Schema for the structured response.
 *
 * Used as an Anthropic tool `input_schema` and as an OpenAI `json_schema`
 * format. Both providers enforce it, so parsing never has to cope with prose.
 */
export const CLASSIFICATION_SCHEMA = {
    type: 'object',
    properties: {
        variant: {
            type: 'string',
            enum: ['invoice', 'receipt', 'credit_note', 'other'],
            description:
                'invoice: a supplier invoice requesting or recording payment owed. ' +
                'receipt: proof that a payment was made. ' +
                'credit_note: a reversal or refund of a prior invoice. ' +
                'other: anything else (bank statement, contract, payslip, ticket, report, quote).',
        },
        confidence: {
            type: 'number',
            description:
                'How certain you are, from 0 to 1. Use values below 0.7 when the document is ' +
                'ambiguous, unreadable, or you are inferring rather than reading. Do not ' +
                'inflate this — a low score routes the document to human review, which is ' +
                'the correct outcome when you are unsure.',
        },
        reason: {
            type: 'string',
            description:
                'One short sentence, in Portuguese, explaining what the document is and what ' +
                'made you decide. This is shown to the user.',
        },
        invoice_number: { type: ['string', 'null'], description: 'Document number as printed.' },
        issue_date: { type: ['string', 'null'], description: 'Issue date as YYYY-MM-DD.' },
        supplier_name: { type: ['string', 'null'], description: 'Name of the issuing company.' },
        supplier_vat_number: {
            type: ['string', 'null'],
            description: 'Supplier tax/VAT number (NIF/NIPC in Portugal).',
        },
        total_without_vat: { type: ['string', 'null'], description: 'Net total, digits and dot only.' },
        total_vat: { type: ['string', 'null'], description: 'VAT amount, digits and dot only.' },
        invoice_total: { type: ['string', 'null'], description: 'Gross total, digits and dot only.' },
        currency: { type: ['string', 'null'], description: 'ISO code, e.g. EUR.' },
        numb_pages: { type: ['integer', 'null'], description: 'Page count.' },
    },
    required: ['variant', 'confidence', 'reason'],
    additionalProperties: false,
} as const

export const CLASSIFICATION_TOOL_NAME = 'record_classification'

export interface PromptContext {
    filename: string
    subject?: string | null
    sender?: string | null
    /** User-authored natural-language rules, from prompt_hint rules. */
    hints?: string[]
}

/**
 * System prompt.
 *
 * Two things it works hard at, because they are this app's actual failure
 * modes:
 *
 *   1. Not everything is an invoice. The complaint that started this work was
 *      non-invoices being accepted as invoices, so the instruction to prefer
 *      `other` when unsure is doing real work.
 *   2. Receipts are distinct from invoices. Collapsing them loses the
 *      distinction that invoice/receipt pairing depends on.
 */
export function buildSystemPrompt(): string {
    return [
        'You classify PDF documents for a Portuguese bookkeeping tool.',
        '',
        'Decide what kind of document this is and, when it is a financial document,',
        'extract its key fields.',
        '',
        'Rules:',
        '- Only call something an invoice if it actually requests or records an amount',
        '  owed to a supplier. Bank statements, contracts, payslips, tickets, booking',
        '  confirmations, quotes, proposals and reports are NOT invoices — classify',
        '  them as "other".',
        '- A receipt proves a payment was already made. It is NOT an invoice. Some',
        '  senders issue both for one transaction; classify each for what it is and do',
        '  not merge them.',
        '- A Portuguese "fatura-recibo" (FR) serves as both. Classify it as "invoice".',
        '- A quote, proforma or proposal is not yet payable. Classify as "other".',
        '- If the document is unreadable, or you are guessing, say so with a low',
        '  confidence rather than picking a plausible-looking answer. A low confidence',
        '  sends it to a human, which is far better than a confident mistake.',
        '',
        'Amounts must be plain numbers using a dot as the decimal separator, with no',
        'currency symbol or thousands separator. Use null for anything not present in',
        'the document — never invent a value.',
    ].join('\n')
}

/**
 * User message. Email metadata is included because it disambiguates documents
 * whose content alone is unclear — a generically-named PDF in a mail titled
 * "A sua fatura de janeiro" is much more likely to be an invoice.
 */
export function buildUserPrompt(context: PromptContext): string {
    const lines = [
        'Classify the attached PDF.',
        '',
        `Filename: ${context.filename}`,
    ]

    if (context.subject) lines.push(`Email subject: ${context.subject}`)
    if (context.sender) lines.push(`Sender: ${context.sender}`)

    lines.push(
        '',
        'Treat this metadata as a hint only. The document contents decide.',
    )

    if (context.hints?.length) {
        lines.push(
            '',
            "The user has given standing instructions about their own documents.",
            'Apply them when they are relevant, but they do not override what the',
            'document plainly is — if an instruction contradicts the document, follow',
            'the document and lower your confidence.',
            '',
            // Delimited and quoted so instruction text cannot be mistaken for
            // part of the surrounding task description.
            ...context.hints.map((hint) => `- "${hint.replace(/"/g, "'")}"`),
        )
    }

    return lines.join('\n')
}

/** Raw shape returned by either provider, before normalisation. */
export interface RawClassification {
    variant: string
    confidence: number
    reason: string
    invoice_number?: string | null
    issue_date?: string | null
    supplier_name?: string | null
    supplier_vat_number?: string | null
    total_without_vat?: string | null
    total_vat?: string | null
    invoice_total?: string | null
    currency?: string | null
    numb_pages?: number | null
}
