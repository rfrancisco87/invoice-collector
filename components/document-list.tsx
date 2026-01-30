'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useRouter } from 'next/navigation'
import { ExternalLink, FileText, AlertCircle } from 'lucide-react'
import toast from 'react-hot-toast'

interface Document {
  id: string
  filename: string
  sender: string
  sender_domain: string
  subject: string
  received_date: string
  original_classification: string
  final_classification: string
  confidence_score: number
  drive_file_id: string
  status: string
  was_reclassified: boolean
  webhook_error: string | null
  document_type: string | null
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

  if (documents.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium text-foreground">Sem documentos pendentes</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Clique em &quot;Sincronizar&quot; para procurar novas faturas.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y divide-border">
      {documents.map((doc) => (
        <div key={doc.id} className="px-6 py-4 hover:bg-muted/50 transition-colors">
          <div className="flex items-start justify-between gap-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h3 className="font-medium text-foreground truncate">{doc.filename}</h3>
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
                {doc.was_reclassified && (
                  <Badge variant="warning">Reclassificado</Badge>
                )}
                {doc.webhook_error && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertCircle className="h-3 w-3" />
                    Erro Webhook
                  </Badge>
                )}
              </div>
              <div className="mt-2 text-sm text-muted-foreground space-y-1">
                <p>
                  De: <span className="font-medium text-foreground">{doc.sender}</span>{' '}
                  <span className="text-muted-foreground">({doc.sender_domain})</span>
                </p>
                <p className="truncate">Assunto: {doc.subject}</p>
                <p>
                  Recebido: {new Date(doc.received_date).toLocaleString('pt-PT')} | Confiança:{' '}
                  {(doc.confidence_score * 100).toFixed(0)}%
                </p>
              </div>
            </div>

            <div className="flex flex-col gap-2 shrink-0">
              <Button
                onClick={() => openInDrive(doc.drive_file_id)}
                variant="outline"
                size="sm"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Ver PDF
              </Button>

              {reclassifyingId === doc.id ? (
                <div className="flex flex-col gap-1">
                  <Button
                    onClick={() => handleReclassify(doc.id, 'invoice')}
                    variant="outline"
                    size="sm"
                  >
                    → Fatura
                  </Button>
                  <Button
                    onClick={() => handleReclassify(doc.id, 'credit_note')}
                    variant="outline"
                    size="sm"
                  >
                    → Nota de Crédito
                  </Button>
                  <Button
                    onClick={() => setReclassifyingId(null)}
                    variant="ghost"
                    size="sm"
                  >
                    Cancelar
                  </Button>
                </div>
              ) : (
                <>
                  <Button
                    onClick={() => handleAction(doc.id, 'approve')}
                    disabled={processingId === doc.id || reprocessingId === doc.id}
                    variant="default"
                    size="sm"
                  >
                    {processingId === doc.id ? 'A processar...' : 'Aprovar'}
                  </Button>
                  <Button
                    onClick={() => handleAction(doc.id, 'reject')}
                    disabled={processingId === doc.id || reprocessingId === doc.id}
                    variant="destructive"
                    size="sm"
                  >
                    Rejeitar
                  </Button>
                  <Button
                    onClick={() => setReclassifyingId(doc.id)}
                    disabled={processingId === doc.id || reprocessingId === doc.id}
                    variant="outline"
                    size="sm"
                  >
                    Reclassificar
                  </Button>
                  {doc.webhook_error && (
                    <Button
                      onClick={() => handleReprocess(doc.id)}
                      disabled={processingId === doc.id || reprocessingId === doc.id}
                      variant="outline"
                      size="sm"
                    >
                      {reprocessingId === doc.id ? 'A reprocessar...' : 'Reprocessar'}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
