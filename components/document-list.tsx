'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { useRouter } from 'next/navigation'
import {
  ExternalLink,
  FileText,
  AlertCircle,
  Mail,
  Calendar,
  Check,
  X,
  RefreshCw,
  Tag,
  HardDrive,
  Pencil,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { DocumentEditDialog, type EditableDocument } from '@/components/document-edit-dialog'

interface Document {
  id: string
  filename: string
  sender: string
  sender_domain: string
  subject: string | null
  received_date: string
  original_classification: string
  final_classification: string
  confidence_score: number
  drive_file_id: string
  status: string
  was_reclassified: boolean
  webhook_error: string | null
  document_type?: string | null
  invoice_number?: string | null
  supplier_name?: string | null
  supplier_vat_number?: string | null
  issue_date?: string | null
  total_without_vat?: number | null
  total_vat?: number | null
  invoice_total?: number | null
  currency?: string | null
  is_demo?: boolean
  source?: 'gmail' | 'inbox_folder'
}

interface DocumentListProps {
  documents: Document[]
}

export function DocumentList({ documents }: DocumentListProps) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)
  const [editingDoc, setEditingDoc] = useState<EditableDocument | null>(null)

  const handleAction = async (documentId: string, action: 'approve' | 'reject') => {
    try {
      setProcessingId(documentId)

      const response = await fetch('/api/documents/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, action }),
      })

      if (!response.ok) {
        throw new Error('Falha na acção')
      }

      toast.success(action === 'approve' ? 'Documento aprovado' : 'Documento rejeitado')
      router.refresh()
    } catch (error) {
      console.error('Action error:', error)
      toast.error(`Falha ao ${action === 'approve' ? 'aprovar' : 'rejeitar'} documento.`)
    } finally {
      setProcessingId(null)
    }
  }

  const handleReclassify = async (documentId: string, newClassification: string) => {
    try {
      setReclassifyingId(null)

      const response = await fetch('/api/documents/reclassify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, classification: newClassification }),
      })

      if (!response.ok) {
        throw new Error('Falha na reclassificação')
      }

      toast.success('Documento reclassificado')
      router.refresh()
    } catch (error) {
      console.error('Reclassify error:', error)
      toast.error('Falha ao reclassificar documento.')
    }
  }

  const handleReprocess = async (documentId: string) => {
    try {
      setReprocessingId(documentId)

      const response = await fetch('/api/documents/reprocess-webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId }),
      })

      if (!response.ok) {
        throw new Error('Falha no reprocessamento')
      }

      toast.success('Webhook reprocessado')
      router.refresh()
    } catch (error) {
      console.error('Reprocess error:', error)
      toast.error('Falha ao reprocessar documento.')
    } finally {
      setReprocessingId(null)
    }
  }

  const openInDrive = (driveFileId: string) => {
    window.open(`https://drive.google.com/file/d/${driveFileId}/view`, '_blank')
  }

  const getClassificationLabel = (classification: string) => {
    switch (classification) {
      case 'invoice':
        return 'Fatura'
      case 'credit_note':
        return 'Nota de Crédito'
      default:
        return 'Não classificado'
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
        <h3 className="mt-4 text-base font-semibold text-foreground">Sem documentos pendentes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Clique em &quot;Sincronizar&quot; para procurar novas faturas.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Column Headers */}
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-shrink-0 w-8">
            <span className="text-xs font-medium text-muted-foreground">Tipo</span>
          </div>
          <div className="flex-1 min-w-0 max-w-[200px]">
            <span className="text-xs font-medium text-muted-foreground">Fornecedor</span>
          </div>
          <div className="flex-shrink-0 w-40">
            <span className="text-xs font-medium text-muted-foreground">Nº Documento</span>
          </div>
          <div className="flex-shrink-0 w-28">
            <span className="text-xs font-medium text-muted-foreground">Data</span>
          </div>
          <div className="flex-shrink-0 w-28 text-right">
            <span className="text-xs font-medium text-muted-foreground">Total</span>
          </div>
          <div className="flex-shrink-0">
            <span className="text-xs font-medium text-muted-foreground">Estado</span>
          </div>
          <div className="flex-shrink-0 w-44 text-right ml-auto">
            <span className="text-xs font-medium text-muted-foreground">Ações</span>
          </div>
        </div>
      </div>

      {/* Document List */}
      <div className="divide-y divide-border">
        {documents.map((doc, index) => {
          const isProcessing = processingId === doc.id
          const isReprocessing = reprocessingId === doc.id
          const isReclassifying = reclassifyingId === doc.id
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
                    {doc.source === 'inbox_folder' ? (
                      <HardDrive className="h-3 w-3 flex-shrink-0" />
                    ) : (
                      <Mail className="h-3 w-3 flex-shrink-0" />
                    )}
                    <span className="truncate">{doc.sender || (doc.source === 'inbox_folder' ? 'Google Drive' : 'Desconhecido')}</span>
                  </div>
                </div>

                {/* Invoice Number Column */}
                <div className="flex-shrink-0 w-40">
                  {doc.invoice_number ? (
                    <p className="text-sm font-medium text-foreground">{doc.invoice_number}</p>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>

                {/* Date Column */}
                <div className="flex-shrink-0 w-28">
                  <div className="flex items-center gap-1 text-sm">
                    <Calendar className="h-3 w-3 text-muted-foreground" />
                    <span className="text-foreground">{new Date(doc.received_date).toLocaleDateString('pt-PT')}</span>
                  </div>
                </div>

                {/* Total Column */}
                <div className="flex-shrink-0 w-28 text-right">
                  {doc.invoice_total != null ? (
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(doc.invoice_total, doc.currency)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>

                {/* Status/Badges Column */}
                <div className="flex-shrink-0 flex items-center gap-2">
                  {doc.is_demo && (
                    <Badge className="bg-warning/10 text-warning border-warning/20 text-xs">
                      DEMO
                    </Badge>
                  )}
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                    {Math.round(doc.confidence_score * 100)}%
                  </span>
                  {doc.was_reclassified && (
                    <Badge variant="outline" className="text-xs">
                      Reclassificado
                    </Badge>
                  )}
                  {doc.webhook_error && (
                    <Badge variant="destructive" className="gap-1 text-xs">
                      <AlertCircle className="h-3 w-3" />
                      Erro
                    </Badge>
                  )}
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 w-44 flex items-center justify-end gap-1 ml-auto">
                  <TooltipProvider delayDuration={300}>
                    {isReclassifying ? (
                      <div className="flex items-center gap-1">
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => handleReclassify(doc.id, 'invoice')}
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs"
                            >
                              Fatura
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Classificar como Fatura</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => handleReclassify(doc.id, 'credit_note')}
                              variant="outline"
                              size="sm"
                              className="h-8 px-2 text-xs"
                            >
                              NC
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Classificar como Nota de Crédito</TooltipContent>
                        </Tooltip>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => setReclassifyingId(null)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Cancelar</TooltipContent>
                        </Tooltip>
                      </div>
                    ) : (
                      <>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => openInDrive(doc.drive_file_id)}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Ver PDF no Drive</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => handleAction(doc.id, 'approve')}
                              disabled={isProcessing || isReprocessing}
                              variant="default"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Aprovar documento</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => handleAction(doc.id, 'reject')}
                              disabled={isProcessing || isReprocessing}
                              variant="destructive"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Rejeitar documento</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => setReclassifyingId(doc.id)}
                              disabled={isProcessing || isReprocessing}
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Tag className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Reclassificar</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              onClick={() => setEditingDoc(doc)}
                              disabled={isProcessing || isReprocessing}
                              variant="outline"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Editar dados</TooltipContent>
                        </Tooltip>

                        {doc.webhook_error && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                onClick={() => handleReprocess(doc.id)}
                                disabled={isProcessing || isReprocessing}
                                variant="outline"
                                size="sm"
                                className="h-8 w-8 p-0"
                              >
                                <RefreshCw className={`h-4 w-4 ${isReprocessing ? 'animate-spin' : ''}`} />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Reprocessar webhook</TooltipContent>
                          </Tooltip>
                        )}
                      </>
                    )}
                  </TooltipProvider>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <DocumentEditDialog
        document={editingDoc}
        open={!!editingDoc}
        onOpenChange={(open) => { if (!open) setEditingDoc(null) }}
      />
    </div>
  )
}
