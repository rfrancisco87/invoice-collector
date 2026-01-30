'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
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
} from 'lucide-react'
import toast from 'react-hot-toast'

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
  invoice_total?: number | null
  currency?: string | null
}

interface DocumentListProps {
  documents: Document[]
}

export function DocumentList({ documents }: DocumentListProps) {
  const router = useRouter()
  const [processingId, setProcessingId] = useState<string | null>(null)
  const [reclassifyingId, setReclassifyingId] = useState<string | null>(null)
  const [reprocessingId, setReprocessingId] = useState<string | null>(null)

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
    <div className="divide-y divide-border">
      {documents.map((doc) => {
        const isProcessing = processingId === doc.id
        const isReprocessing = reprocessingId === doc.id
        const isReclassifying = reclassifyingId === doc.id

        return (
          <div key={doc.id} className="p-5 hover:bg-muted/50 transition-colors">
            <div className="flex flex-col lg:flex-row lg:items-start gap-4">
              {/* Main Content */}
              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="font-semibold text-foreground truncate">
                    {doc.supplier_name || doc.filename}
                  </h3>
                  <Badge
                    variant={
                      doc.final_classification === 'invoice'
                        ? 'info'
                        : doc.final_classification === 'credit_note'
                        ? 'warning'
                        : 'secondary'
                    }
                  >
                    {getClassificationLabel(doc.final_classification)}
                  </Badge>
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

                {doc.supplier_name && (
                  <p className="mt-0.5 text-sm text-muted-foreground truncate">
                    {doc.filename}
                  </p>
                )}

                {/* Invoice Details */}
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                  {doc.invoice_number && (
                    <span className="text-sm">
                      <span className="text-muted-foreground">Nº </span>
                      <span className="font-medium">{doc.invoice_number}</span>
                    </span>
                  )}
                  {doc.invoice_total != null && (
                    <span className="text-sm font-semibold text-foreground">
                      {formatCurrency(doc.invoice_total, doc.currency)}
                    </span>
                  )}
                </div>

                {/* Metadata */}
                <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-muted-foreground">
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-4 w-4" />
                    <span className="truncate max-w-[200px]">{doc.sender}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Calendar className="h-4 w-4" />
                    <span>{new Date(doc.received_date).toLocaleDateString('pt-PT')}</span>
                  </div>
                </div>

                {/* Subject */}
                {doc.subject && (
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-1 italic">
                    {doc.subject}
                  </p>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-2 lg:flex-col lg:items-stretch lg:w-40">
                {isReclassifying ? (
                  <>
                    <p className="text-xs font-medium text-muted-foreground w-full">Reclassificar como:</p>
                    <Button
                      onClick={() => handleReclassify(doc.id, 'invoice')}
                      variant="outline"
                      size="sm"
                      className="flex-1 lg:w-full"
                    >
                      Fatura
                    </Button>
                    <Button
                      onClick={() => handleReclassify(doc.id, 'credit_note')}
                      variant="outline"
                      size="sm"
                      className="flex-1 lg:w-full"
                    >
                      Nota de Crédito
                    </Button>
                    <Button
                      onClick={() => setReclassifyingId(null)}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                    >
                      Cancelar
                    </Button>
                  </>
                ) : (
                  <>
                    <Button
                      onClick={() => openInDrive(doc.drive_file_id)}
                      variant="outline"
                      size="sm"
                      className="gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Ver PDF
                    </Button>

                    <Button
                      onClick={() => handleAction(doc.id, 'approve')}
                      disabled={isProcessing || isReprocessing}
                      variant="default"
                      size="sm"
                      className="gap-1"
                    >
                      <Check className="h-4 w-4" />
                      {isProcessing ? '...' : 'Aprovar'}
                    </Button>

                    <Button
                      onClick={() => handleAction(doc.id, 'reject')}
                      disabled={isProcessing || isReprocessing}
                      variant="destructive"
                      size="sm"
                      className="gap-1"
                    >
                      <X className="h-4 w-4" />
                    </Button>

                    <Button
                      onClick={() => setReclassifyingId(doc.id)}
                      disabled={isProcessing || isReprocessing}
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                    >
                      Reclassificar
                    </Button>

                    {doc.webhook_error && (
                      <Button
                        onClick={() => handleReprocess(doc.id)}
                        disabled={isProcessing || isReprocessing}
                        variant="outline"
                        size="sm"
                        className="gap-2"
                      >
                        <RefreshCw className={`h-4 w-4 ${isReprocessing ? 'animate-spin' : ''}`} />
                        {isReprocessing ? '...' : 'Reprocessar'}
                      </Button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
