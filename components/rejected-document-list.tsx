'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { Bot, Mail, HardDrive, RotateCcw, FileText } from 'lucide-react'
import toast from 'react-hot-toast'

interface Document {
  id: string
  filename: string
  sender: string | null
  sender_domain: string | null
  subject: string | null
  received_date: string
  rejected_at: string | null
  auto_action_reason: string | null
  source: 'gmail' | 'inbox_folder'
  supplier_name?: string | null
  invoice_number?: string | null
}

interface RejectedDocumentListProps {
  documents: Document[]
}

const REASON_LABELS: Record<string, string> = {
  file_hash_rejected: 'Ficheiro idêntico rejeitado antes',
  sender_blocked: 'Remetente consistentemente rejeitado',
}

export function RejectedDocumentList({ documents }: RejectedDocumentListProps) {
  const router = useRouter()
  const [restoringId, setRestoringId] = useState<string | null>(null)

  const handleRestore = async (doc: Document) => {
    try {
      setRestoringId(doc.id)
      const response = await fetch('/api/documents/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: doc.id }),
      })
      const body = await response.json()
      if (!response.ok) throw new Error(body.error || 'Falha ao restaurar')

      // Both paths end with the document back in the pending list: manual
      // rejections are untrashed in place, auto-rejections are fetched again
      // from Gmail / the inbox original and reprocessed.
      toast.success('Restaurado. O documento voltou para pendentes.')
      router.refresh()
    } catch (error) {
      console.error('Restore error:', error)
      toast.error(error instanceof Error ? error.message : 'Falha ao restaurar')
    } finally {
      setRestoringId(null)
    }
  }

  if (documents.length === 0) {
    return (
      <div className="px-6 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-muted">
          <FileText className="h-7 w-7 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-base font-semibold text-foreground">Sem documentos rejeitados</h3>
      </div>
    )
  }

  return (
    <div>
      <div className="border-b border-border bg-muted/30 px-4 py-3">
        <div className="flex items-center gap-4">
          <div className="flex-1 min-w-0">
            <span className="text-xs font-medium text-muted-foreground">Documento</span>
          </div>
          <div className="flex-shrink-0 w-64">
            <span className="text-xs font-medium text-muted-foreground">Motivo</span>
          </div>
          <div className="flex-shrink-0 w-28">
            <span className="text-xs font-medium text-muted-foreground">Rejeitado</span>
          </div>
          <div className="flex-shrink-0 w-28 text-right ml-auto">
            <span className="text-xs font-medium text-muted-foreground">Ações</span>
          </div>
        </div>
      </div>

      <div className="divide-y divide-border">
        {documents.map((doc, index) => {
          const isEven = index % 2 === 0
          const isAuto = !!doc.auto_action_reason
          const isRestoring = restoringId === doc.id

          return (
            <div
              key={doc.id}
              className={`p-4 transition-colors hover:bg-muted/70 ${
                isEven ? 'bg-muted/20' : 'bg-background'
              }`}
            >
              <div className="flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold text-foreground text-sm truncate">
                    {doc.supplier_name || doc.filename}
                  </h3>
                  <div className="flex items-center gap-1 mt-0.5 text-xs text-muted-foreground">
                    {doc.source === 'inbox_folder' ? (
                      <HardDrive className="h-3 w-3 flex-shrink-0" />
                    ) : (
                      <Mail className="h-3 w-3 flex-shrink-0" />
                    )}
                    <span className="truncate">
                      {doc.sender || (doc.source === 'inbox_folder' ? 'Google Drive' : 'Desconhecido')}
                    </span>
                  </div>
                </div>

                <div className="flex-shrink-0 w-64">
                  {isAuto ? (
                    <Badge className="gap-1 bg-info/10 text-info border-info/20">
                      <Bot className="h-3 w-3" />
                      {REASON_LABELS[doc.auto_action_reason!] || doc.auto_action_reason}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">Rejeitado manualmente</span>
                  )}
                </div>

                <div className="flex-shrink-0 w-28 text-xs text-muted-foreground">
                  {doc.rejected_at
                    ? new Date(doc.rejected_at).toLocaleDateString('pt-PT')
                    : '—'}
                </div>

                <div className="flex-shrink-0 w-28 flex justify-end ml-auto">
                  <TooltipProvider delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={() => handleRestore(doc)}
                          disabled={isRestoring}
                          variant="outline"
                          size="sm"
                          className="h-8 gap-1"
                        >
                          <RotateCcw className={`h-3.5 w-3.5 ${isRestoring ? 'animate-spin' : ''}`} />
                          Restaurar
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {isAuto
                          ? 'Reverter rejeição automática. O ficheiro é reprocessado e volta para pendentes.'
                          : 'Reverter rejeição. O documento volta para pendentes.'}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
