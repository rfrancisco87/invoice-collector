'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

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
        throw new Error('Action failed')
      }

      router.refresh()
    } catch (error) {
      console.error('Action error:', error)
      alert(`Failed to ${action} document. Please try again.`)
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
        throw new Error('Reclassify failed')
      }

      router.refresh()
    } catch (error) {
      console.error('Reclassify error:', error)
      alert('Failed to reclassify document. Please try again.')
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
        throw new Error('Reprocess failed')
      }

      router.refresh()
    } catch (error) {
      console.error('Reprocess error:', error)
      alert('Failed to reprocess document. Please try again.')
    } finally {
      setReprocessingId(null)
    }
  }

  const openInDrive = (driveFileId: string) => {
    window.open(`https://drive.google.com/file/d/${driveFileId}/view`, '_blank')
  }

  if (documents.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <svg
          className="mx-auto h-12 w-12 text-gray-400"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <h3 className="mt-2 text-sm font-medium text-gray-900">No pending documents</h3>
        <p className="mt-1 text-sm text-gray-500">
          Click "Sync Emails" to scan your Gmail for new invoices.
        </p>
      </div>
    )
  }

  return (
    <div className="divide-y">
      {documents.map((doc) => (
        <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3">
                <h3 className="font-medium text-gray-900">{doc.filename}</h3>
                <span
                  className={`inline-flex rounded-full px-2 py-1 text-xs font-semibold ${
                    doc.final_classification === 'invoice'
                      ? 'bg-blue-100 text-blue-800'
                      : doc.final_classification === 'credit_note'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-800'
                  }`}
                >
                  {doc.final_classification === 'invoice'
                    ? 'Invoice'
                    : doc.final_classification === 'credit_note'
                    ? 'Credit Note'
                    : 'Unclassified'}
                </span>
                {doc.was_reclassified && (
                  <span className="inline-flex rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
                    Reclassified
                  </span>
                )}
                {doc.webhook_error && (
                  <span className="inline-flex rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
                    Webhook Error
                  </span>
                )}
              </div>
              <div className="mt-1 text-sm text-gray-600">
                <p>
                  From: <span className="font-medium">{doc.sender}</span> ({doc.sender_domain})
                </p>
                <p>Subject: {doc.subject}</p>
                <p>Received: {new Date(doc.received_date).toLocaleString()}</p>
                <p>Confidence: {(doc.confidence_score * 100).toFixed(0)}%</p>
              </div>
            </div>

            <div className="ml-4 flex flex-col gap-2">
              <Button
                onClick={() => openInDrive(doc.drive_file_id)}
                variant="outline"
                size="sm"
              >
                View PDF
              </Button>

              {reclassifyingId === doc.id ? (
                <div className="flex flex-col gap-1">
                  <Button
                    onClick={() => handleReclassify(doc.id, 'invoice')}
                    variant="outline"
                    size="sm"
                  >
                    → Invoice
                  </Button>
                  <Button
                    onClick={() => handleReclassify(doc.id, 'credit_note')}
                    variant="outline"
                    size="sm"
                  >
                    → Credit Note
                  </Button>
                  <Button
                    onClick={() => setReclassifyingId(null)}
                    variant="outline"
                    size="sm"
                  >
                    Cancel
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
                    {processingId === doc.id ? 'Processing...' : 'Approve'}
                  </Button>
                  <Button
                    onClick={() => handleAction(doc.id, 'reject')}
                    disabled={processingId === doc.id || reprocessingId === doc.id}
                    variant="destructive"
                    size="sm"
                  >
                    Reject
                  </Button>
                  <Button
                    onClick={() => setReclassifyingId(doc.id)}
                    disabled={processingId === doc.id || reprocessingId === doc.id}
                    variant="outline"
                    size="sm"
                  >
                    Reclassify
                  </Button>
                  {doc.webhook_error && (
                    <Button
                      onClick={() => handleReprocess(doc.id)}
                      disabled={processingId === doc.id || reprocessingId === doc.id}
                      variant="outline"
                      size="sm"
                    >
                      {reprocessingId === doc.id ? 'Reprocessing...' : 'Reprocess'}
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
