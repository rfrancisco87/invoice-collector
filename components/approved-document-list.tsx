'use client'

import { useState, useMemo } from 'react'
import { ExternalLink, FileText, Calendar, Mail, FolderOpen, Search, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'

interface Document {
  id: string
  filename: string
  sender: string
  sender_domain: string
  subject: string | null
  received_date: string
  final_classification: 'invoice' | 'credit_note' | 'unclassified'
  confidence_score: number
  drive_file_id: string | null
  drive_folder_path: string | null
  approved_at: string | null
  invoice_number?: string | null
  supplier_name?: string | null
  invoice_total?: number | null
  currency?: string | null
}

interface ApprovedDocumentListProps {
  documents: Document[]
}

export function ApprovedDocumentList({ documents }: ApprovedDocumentListProps) {
  const [searchTerm, setSearchTerm] = useState('')

  const filteredDocuments = useMemo(() => {
    if (!searchTerm) return documents

    const search = searchTerm.toLowerCase()
    return documents.filter(
      doc =>
        doc.filename.toLowerCase().includes(search) ||
        doc.sender.toLowerCase().includes(search) ||
        (doc.subject?.toLowerCase().includes(search) ?? false) ||
        (doc.supplier_name?.toLowerCase().includes(search) ?? false) ||
        (doc.invoice_number?.toLowerCase().includes(search) ?? false)
    )
  }, [documents, searchTerm])

  const getClassificationLabel = (classification: string) => {
    switch (classification) {
      case 'invoice':
        return 'Fatura'
      case 'credit_note':
        return 'Nota de Crédito'
      default:
        return 'Outro'
    }
  }

  const formatCurrency = (value: number | null | undefined, currency: string | null | undefined) => {
    if (value == null) return null

    // Map currency symbols to ISO codes
    const currencyMap: Record<string, string> = {
      '€': 'EUR',
      '$': 'USD',
      '£': 'GBP',
    }

    let currencyCode = currency || 'EUR'
    // If it's a symbol, convert to ISO code
    if (currencyCode.length <= 1 || currencyMap[currencyCode]) {
      currencyCode = currencyMap[currencyCode] || 'EUR'
    }

    try {
      return new Intl.NumberFormat('pt-PT', {
        style: 'currency',
        currency: currencyCode,
      }).format(value)
    } catch {
      // Fallback if currency code is invalid
      return `${value.toFixed(2)} ${currency || '€'}`
    }
  }

  if (documents.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">Sem documentos aprovados</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Os documentos que aprovar aparecerão aqui.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Search */}
      <div className="border-b border-border px-6 py-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar documentos..."
            className="pl-9"
          />
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {filteredDocuments.length} de {documents.length} documentos
        </p>
      </div>

      {/* Document List */}
      <div className="divide-y divide-border">
        {filteredDocuments.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum documento corresponde à pesquisa.</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <div key={doc.id} className="p-5 hover:bg-muted/50 transition-colors">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-semibold text-foreground truncate">
                      {doc.supplier_name || doc.filename}
                    </h3>
                    <Badge
                      variant={doc.final_classification === 'invoice' ? 'success' : 'warning'}
                    >
                      {getClassificationLabel(doc.final_classification)}
                    </Badge>
                    {doc.invoice_total != null && (
                      <span className="font-semibold text-foreground">
                        {formatCurrency(doc.invoice_total, doc.currency)}
                      </span>
                    )}
                  </div>

                  {doc.supplier_name && (
                    <p className="mt-0.5 text-sm text-muted-foreground truncate">
                      {doc.filename}
                    </p>
                  )}

                  {doc.invoice_number && (
                    <p className="mt-1 text-sm">
                      <span className="text-muted-foreground">Nº </span>
                      <span className="font-medium">{doc.invoice_number}</span>
                    </p>
                  )}
                </div>

                {doc.drive_file_id && (
                  <Button asChild variant="default" size="sm">
                    <a
                      href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 whitespace-nowrap"
                    >
                      <ExternalLink className="h-4 w-4 shrink-0" />
                      Ver no Drive
                    </a>
                  </Button>
                )}
              </div>

              {/* Metadata */}
              <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-1.5">
                  <Mail className="h-4 w-4" />
                  <span className="truncate">{doc.sender}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-4 w-4" />
                  <span>{new Date(doc.received_date).toLocaleDateString('pt-PT')}</span>
                </div>
                {doc.drive_folder_path && (
                  <div className="flex items-center gap-1.5">
                    <FolderOpen className="h-4 w-4" />
                    <span className="truncate">{doc.drive_folder_path}</span>
                  </div>
                )}
                {doc.approved_at && (
                  <div className="flex items-center gap-1.5 text-green-600 dark:text-green-500">
                    <CheckCircle2 className="h-4 w-4" />
                    <span>Aprovado {new Date(doc.approved_at).toLocaleDateString('pt-PT')}</span>
                  </div>
                )}
              </div>

              {/* Subject */}
              {doc.subject && (
                <p className="mt-2 text-sm text-muted-foreground line-clamp-1 italic">
                  {doc.subject}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
