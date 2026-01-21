'use client'

import { useState, useMemo } from 'react'
import { ExternalLink, FileText, Calendar, User, FolderOpen } from 'lucide-react'

interface Document {
  id: string
  filename: string
  sender: string
  sender_domain: string
  subject: string
  received_date: string
  final_classification: 'invoice' | 'credit_note' | 'other'
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

  // Filter and sort documents
  const filteredDocuments = useMemo(() => {
    let filtered = documents

    // Apply search filter
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

    // Apply classification filter
    if (filterClassification !== 'all') {
      filtered = filtered.filter(doc => doc.final_classification === filterClassification)
    }

    // Apply sorting
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

  const getClassificationBadge = (classification: string) => {
    switch (classification) {
      case 'invoice':
        return 'bg-green-100 text-green-800'
      case 'credit_note':
        return 'bg-orange-100 text-orange-800'
      case 'other':
        return 'bg-gray-100 text-gray-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getClassificationLabel = (classification: string) => {
    switch (classification) {
      case 'invoice':
        return 'Invoice'
      case 'credit_note':
        return 'Credit Note'
      case 'other':
        return 'Other'
      default:
        return classification
    }
  }

  if (documents.length === 0) {
    return (
      <div className="px-6 py-12 text-center">
        <FileText className="mx-auto h-12 w-12 text-gray-400" />
        <h3 className="mt-2 text-sm font-medium text-gray-900">No approved documents</h3>
        <p className="mt-1 text-sm text-gray-500">
          Documents you approve will appear here.
        </p>
      </div>
    )
  }

  return (
    <div>
      {/* Filters */}
      <div className="border-b bg-gray-50 px-6 py-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {/* Search */}
          <div>
            <label htmlFor="search" className="block text-xs font-medium text-gray-700">
              Search
            </label>
            <input
              type="text"
              id="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by filename, sender, or subject..."
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            />
          </div>

          {/* Classification Filter */}
          <div>
            <label htmlFor="classification" className="block text-xs font-medium text-gray-700">
              Classification
            </label>
            <select
              id="classification"
              value={filterClassification}
              onChange={(e) => setFilterClassification(e.target.value)}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="all">All Classifications</option>
              <option value="invoice">Invoices</option>
              <option value="credit_note">Credit Notes</option>
              <option value="other">Other</option>
            </select>
          </div>

          {/* Sort By */}
          <div>
            <label htmlFor="sortBy" className="block text-xs font-medium text-gray-700">
              Sort By
            </label>
            <select
              id="sortBy"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'date' | 'sender' | 'filename')}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="date">Date (Newest First)</option>
              <option value="sender">Sender (A-Z)</option>
              <option value="filename">Filename (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Results count */}
        <div className="mt-3 text-sm text-gray-600">
          Showing {filteredDocuments.length} of {documents.length} documents
        </div>
      </div>

      {/* Document List */}
      <div className="divide-y">
        {filteredDocuments.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <p className="text-sm text-gray-500">No documents match your filters.</p>
          </div>
        ) : (
          filteredDocuments.map((doc) => (
            <div key={doc.id} className="px-6 py-4 hover:bg-gray-50">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Filename and Classification */}
                  <div className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-gray-400" />
                    <h3 className="font-medium text-gray-900">{doc.filename}</h3>
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${getClassificationBadge(
                        doc.final_classification
                      )}`}
                    >
                      {getClassificationLabel(doc.final_classification)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {Math.round(doc.confidence_score * 100)}% confidence
                    </span>
                  </div>

                  {/* Details */}
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <User className="h-4 w-4" />
                      <span className="truncate">{doc.sender}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <Calendar className="h-4 w-4" />
                      <span>{new Date(doc.received_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <FolderOpen className="h-4 w-4" />
                      <span className="truncate">{doc.drive_folder_path || 'Unknown'}</span>
                    </div>
                    {doc.approved_at && (
                      <div className="flex items-center gap-2 text-sm text-green-600">
                        <Calendar className="h-4 w-4" />
                        <span>Approved {new Date(doc.approved_at).toLocaleDateString()}</span>
                      </div>
                    )}
                  </div>

                  {/* Subject */}
                  <p className="mt-2 text-sm text-gray-500 line-clamp-1">{doc.subject}</p>
                </div>

                {/* Actions */}
                <div className="ml-4 flex items-center gap-2">
                  {doc.drive_file_id && (
                    <a
                      href={`https://drive.google.com/file/d/${doc.drive_file_id}/view`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700"
                    >
                      <ExternalLink className="h-4 w-4" />
                      View in Drive
                    </a>
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
