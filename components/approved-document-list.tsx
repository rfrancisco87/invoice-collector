'use client'

import { useState, useMemo } from 'react'
import { ExternalLink, FileText, Mail, FolderOpen, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

interface Document {
  id: string
  filename: string
  sender: string | null
  sender_domain: string | null
  subject: string | null
  received_date: string
  final_classification: 'invoice' | 'credit_note' | 'unclassified'
  confidence_score: number | null
  drive_file_id: string | null
  drive_folder_path: string | null
  approved_at: string | null
  invoice_number?: string | null
  supplier_name?: string | null
  invoice_total?: number | null
  currency?: string | null
  is_demo?: boolean
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
        doc.sender?.toLowerCase().includes(search) ||
        (doc.subject?.toLowerCase().includes(search) ?? false) ||
        (doc.supplier_name?.toLowerCase().includes(search) ?? false) ||
        (doc.invoice_number?.toLowerCase().includes(search) ?? false)
    )
  }, [documents, searchTerm])

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


      {/* Column Headers */}
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-8">
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
          </div>
          <div className="flex-1 min-w-0 max-w-[200px]">
            <span className="text-xs font-medium text-muted-foreground">Fornecedor</span>
          </div>
          <div className="flex-shrink-0 w-32">
            <span className="text-xs font-medium text-muted-foreground">Nº Documento</span>
          </div>
          <div className="flex-shrink-0 w-28 text-right">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
          </div>
          <div className="flex-shrink-0 w-40">
            <span className="text-xs font-medium text-muted-foreground">Localização</span>
          </div>
          <div className="flex-shrink-0 w-12 text-right ml-auto">
            <span className="text-xs font-medium text-muted-foreground">Ações</span>
          </div>
        </div>
      </div>

      {/* Document List */}
      <div className="divide-y divide-border">
        {filteredDocuments.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum documento corresponde à pesquisa.</p>
          </div>
        ) : (
          filteredDocuments.map((doc, index) => {
            const isEven = index % 2 === 0

            return (
              <div
                key={doc.id}
                className={`p-4 transition-colors hover:bg-muted/70 ${isEven ? 'bg-muted/20' : 'bg-background'
                  }`}
              >
                <div className="flex items-center gap-4">
                  {/* Type Indicator Column */}
                  <div className="flex-shrink-0 w-8">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${doc.final_classification === 'invoice'
                        ? 'bg-primary/10 text-primary'
                        : doc.final_classification === 'credit_note'
                          ? 'bg-warning/10 text-warning'
                          : 'bg-muted text-muted-foreground'
                        }`}
                    >
                      {doc.final_classification === 'invoice' ? 'F' : doc.final_classification === 'credit_note' ? 'C' : '?'}
                    </div>
                  </div>

                  {/* Supplier Column */}
                  <div className="flex-1 min-w-0 max-w-[200px]">
                    <h3 className="font-semibold text-foreground text-sm truncate">
                      {doc.supplier_name || doc.filename}
                    </h3>
                    <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                      <Mail className="h-3 w-3 flex-shrink-0" />
                      <span className="truncate">{doc.sender}</span>
                    </div>
                  </div>

                  {/* Invoice Number Column */}
                  <div className="flex-shrink-0 w-32">
                    {doc.invoice_number ? (
                      <p className="text-sm font-medium text-foreground">{doc.invoice_number}</p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Total Column */}
                  <div className="flex-shrink-0 w-28 text-right">
                    {doc.invoice_total ? (
                      <p className="text-sm font-semibold text-foreground">
                        {formatCurrency(doc.invoice_total, doc.currency)}
                      </p>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                    {doc.is_demo && (
                      <Badge className="bg-warning/10 text-warning border-warning/20 text-[10px] ml-1">
                        DEMO
                      </Badge>
                    )}
                  </div>

                  {/* Location Column */}
                  <div className="flex-shrink-0 w-40">
                    {doc.drive_folder_path ? (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <a
                              href={`https://drive.google.com/drive/search?q=${encodeURIComponent(doc.drive_folder_path)}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                            >
                              <FolderOpen className="h-3.5 w-3.5 flex-shrink-0" />
                              <span className="truncate">{doc.drive_folder_path}</span>
                            </a>
                          </TooltipTrigger>
                          <TooltipContent>Abrir pasta no Drive</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </div>

                  {/* Actions Column */}
                  <div className="flex-shrink-0 w-12 flex justify-end ml-auto">
                    {doc.drive_file_id && (
                      <TooltipProvider delayDuration={300}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button asChild variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <a
                                href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                                target="_blank"
                                rel="noopener noreferrer"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ver PDF no Drive</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
