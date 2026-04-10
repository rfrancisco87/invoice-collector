/**
 * Filename template engine for renaming approved invoice files.
 *
 * Supported variables (case-insensitive):
 *   {supplier_name}    - document.supplier_name
 *   {vat_number}       - document.supplier_vat_number
 *   {month}            - 2-digit month from issue_date (fallback received_date)
 *   {year}             - 4-digit year from issue_date (fallback received_date)
 *   {invoice_number}   - document.invoice_number
 *   {invoice_total}    - document.invoice_total (formatted with 2 decimals)
 *   {currency}         - document.currency
 *
 * Missing-value behavior: if a variable resolves to null/empty, the variable
 * AND its preceding literal separator are dropped (so "A - B - C" with B
 * missing becomes "A - C", not "A -  - C"). Leading/trailing separator-like
 * characters are also trimmed at the end.
 */

export const DEFAULT_APPROVED_FILENAME_TEMPLATE = '{supplier_name} - {vat_number} - {month}-{year}'

export const APPROVED_FILENAME_VARIABLES = [
  'supplier_name',
  'vat_number',
  'month',
  'year',
  'invoice_number',
  'invoice_total',
  'currency',
] as const

export type TemplateVariable = (typeof APPROVED_FILENAME_VARIABLES)[number]

export interface DocumentLikeForTemplate {
  supplier_name?: string | null
  supplier_vat_number?: string | null
  invoice_number?: string | null
  invoice_total?: number | string | null
  currency?: string | null
  issue_date?: string | null
  invoice_date?: string | null
  received_date?: string | Date | null
}

/**
 * Build the variable map from a document row.
 * Date variables prefer issue_date / invoice_date; fall back to received_date.
 */
export function buildTemplateVars(doc: DocumentLikeForTemplate): Record<TemplateVariable, string> {
  const dateSource = doc.issue_date || doc.invoice_date || doc.received_date || null
  const date = dateSource ? new Date(dateSource) : null
  const validDate = date && !isNaN(date.getTime()) ? date : null

  const month = validDate ? String(validDate.getMonth() + 1).padStart(2, '0') : ''
  const year = validDate ? String(validDate.getFullYear()) : ''

  const total =
    doc.invoice_total != null && doc.invoice_total !== ''
      ? typeof doc.invoice_total === 'number'
        ? doc.invoice_total.toFixed(2)
        : String(doc.invoice_total)
      : ''

  return {
    supplier_name: (doc.supplier_name || '').trim(),
    vat_number: (doc.supplier_vat_number || '').trim(),
    month,
    year,
    invoice_number: (doc.invoice_number || '').trim(),
    invoice_total: total,
    currency: (doc.currency || '').trim(),
  }
}

type Token =
  | { kind: 'literal'; value: string }
  | { kind: 'var'; name: string }

function tokenize(template: string): Token[] {
  const tokens: Token[] = []
  const re = /\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g
  let lastIdx = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    if (m.index > lastIdx) {
      tokens.push({ kind: 'literal', value: template.slice(lastIdx, m.index) })
    }
    tokens.push({ kind: 'var', name: m[1].toLowerCase() })
    lastIdx = re.lastIndex
  }
  if (lastIdx < template.length) {
    tokens.push({ kind: 'literal', value: template.slice(lastIdx) })
  }
  return tokens
}

/**
 * Apply a template, dropping empty variables AND the literal that immediately
 * precedes them (so separators don't double up). Returns the rendered string
 * (without an extension), trimmed of leading/trailing separator characters.
 *
 * Returns an empty string if every variable resolves empty — callers should
 * fall back to the original filename in that case.
 */
export function applyTemplate(template: string, vars: Record<string, string>): string {
  const tokens = tokenize(template)

  // Resolve var tokens to either their value or null (for "empty").
  const resolved: ({ kind: 'literal'; value: string } | { kind: 'var'; value: string | null })[] =
    tokens.map((t) => {
      if (t.kind === 'literal') return t
      const v = vars[t.name]
      return { kind: 'var', value: v && v.trim() !== '' ? v.trim() : null }
    })

  const out: string[] = []
  for (let i = 0; i < resolved.length; i++) {
    const cur = resolved[i]
    if (cur.kind === 'var') {
      if (cur.value === null) {
        // Drop the preceding literal if we just appended one — that's the
        // separator between this missing var and the previous segment.
        if (out.length > 0 && resolved[i - 1]?.kind === 'literal') {
          out.pop()
        }
        continue
      }
      out.push(cur.value)
    } else {
      out.push(cur.value)
    }
  }

  return out.join('').replace(/^[\s\-_/.]+|[\s\-_/.]+$/g, '').replace(/\s+/g, ' ').trim()
}

/**
 * Drive filenames can technically contain most characters, but we strip the
 * ones that confuse Windows/macOS sync clients and downstream tooling.
 */
export function sanitizeFilename(name: string): string {
  return name
    .replace(/[\/\\:*?"<>|\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Render a final filename (with the original extension preserved) for an
 * approved document. Returns null if the rendered base is empty — callers
 * should keep the existing filename in that case.
 */
export function renderApprovedFilename(
  template: string,
  doc: DocumentLikeForTemplate,
  originalFilename: string,
): string | null {
  const vars = buildTemplateVars(doc)
  const rendered = applyTemplate(template, vars)
  if (!rendered) return null

  const extMatch = originalFilename.match(/\.[^.\\/]+$/)
  const ext = extMatch ? extMatch[0] : ''
  const sanitized = sanitizeFilename(rendered)
  if (!sanitized) return null

  return ext ? `${sanitized}${ext}` : sanitized
}
