'use client'

import { useState, useMemo } from 'react'
import { ExternalLink, FileText, Calendar, User, FolderOpen, Search } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'

interface Document {
  id: string
  filename: string
  sender: string
  sender_domain: string
  subject: string
  received_date: string
  final_classification: 'invoice' | 'credit_note' | 'unclassified'
  confidence_score: number
  drive_file_id: string | null
  drive_folder_path: string | null
  approved_at: string | null
}

interface ApprovedDocumentListProps {
  documents: Document[]
}

export function ApprovedDocumentList({ documents }: ApprovedDocumentListProps) {
  const [searchTerm, setSearchTerm] = useState('')
  const [filterClassification, setFilterClassification] = useState<string>('all')
  const [sortBy, setSortBy] = useState<'date' | 'sender' | 'filename'>('date')

  const filteredDocuments = useMemo(() => {
    let filtered = documents

    if (searchTerm) {
      const search = searchTerm.toLowerCase()
      filtered = filtered.filter(
        doc =>
          doc.filename.toLowerCase().includes(search) ||
          doc.sender.toLowerCase().includes(search) ||
          doc.subject.toLowerCase().includes(search) ||
          doc.sender_domain.toLowerCase().includes(search)
      )
    }

    if (filterClassification !== 'all') {
      filtered = filtered.filter(doc => doc.final_classification === filterClassification)
    }

    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case 'date':
          return new Date(b.received_date).getTime() - new Date(a.received_date).getTime()
        case 'sender':
          return a.sender.localeCompare(b.sender)
        case 'filename':
          return a.filename.localeCompare(b.filename)
        default:
          return 0
      }
    })

    return filtered
  }, [documents, searchTerm, filterClassification, sortBy])

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

  if (documents.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <FileText className="mx-auto h-12 w-12 text-muted-foreground" />
        <h3 className="mt-2 text-sm font-medium text-foreground">Sem documentos aprovados</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          Os documentos que aprovar aparecerão aqui.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="border-b border-border bg-muted/50 px-6 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <Label htmlFor="search" className="text-xs">Pesquisar</Label>
            <div className="relative mt-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                id="search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Pesquisar por nome, remetente ou assunto..."
                className="pl-9"
              />
            </div>
          </div>

          <div>
            <Label htmlFor="classification" className="text-xs">Classificação</Label>
            <select
              id="classification"
              value={filterClassification}
              onChange={(e) => setFilterClassification(e.target.value)}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">Todas as classificações</option>
              <option value="invoice">Faturas</option>
              <option value="credit_note">Notas de Crédito</option>
              <option value="unclassified">Outros</option>
            </select>
          </div>

          <div>
            <Label htmlFor="sortBy" className="text-xs">Ordenar por</Label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'sender' | 'filename')}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="date">Data (Mais recente)</option>
              <option value="sender">Remetente (A-Z)</option>
              <option value="filename">Nome do ficheiro (A-Z)</option>
            </select>
          </div>
        </div>

        <div className="mt-3 text-sm text-muted-foreground">
          A mostrar {filteredDocuments.length} de {documents.length} documentos
        </div>
      </div>

      {/* Document List */}
      <div className="divide-y divide-border">
        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-muted-foreground">Nenhum documento corresponde aos filtros.</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <div key={doc.id} className="px-6 py-4 hover:bg-muted/50 transition-colors">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <FileText className="h-5 w-5 text-muted-foreground shrink-0" />
                    <h3 className="font-medium text-foreground truncate">{doc.filename}</h3>
                    <Badge
                      variant={
                        doc.final_classification === 'invoice'
                          ? 'success'
                          : doc.final_classification === 'credit_note'
                          ? 'warning'
                          : 'secondary'
                      }
                    >
                      {getClassificationLabel(doc.final_classification)}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {Math.round(doc.confidence_score * 100)}% confiança
                    </span>
                  </div>

                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <User className="h-4 w-4 shrink-0" />
                      <span className="truncate">{doc.sender}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4 shrink-0" />
                      <span>{new Date(doc.received_date).toLocaleDateString('pt-PT')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <FolderOpen className="h-4 w-4 shrink-0" />
                      <span className="truncate">{doc.drive_folder_path || 'Desconhecido'}</span>
                    </div>
                    {doc.approved_at && (
                      <div className="flex items-center gap-2 text-sm text-success">
                        <Calendar className="h-4 w-4 shrink-0" />
                        <span>Aprovado em {new Date(doc.approved_at).toLocaleDateString('pt-PT')}</span>
                      </div>
                    )}
                  </div>

                  <p className="mt-2 text-sm text-muted-foreground line-clamp-1">{doc.subject}</p>
                </div>

                <div className="shrink-0">
                  {doc.drive_file_id && (
                    <Button asChild variant="default" size="sm">
                      <a
                        href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="mr-2 h-4 w-4" />
                        Ver no Drive
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
