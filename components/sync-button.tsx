'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function SyncButton() {
  const [isSyncing, setIsSyncing] = useState(false)
  const router = useRouter()

  const handleSync = async () => {
    try {
      setIsSyncing(true)

      const response = await fetch('/api/sync', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Sync failed')
      }

      // Refresh the page to show new documents
      router.refresh()

      // Show detailed debug info
      const debugMsg = data.debug
        ? `\n\nDebug Info:\n` +
          `- Query: ${data.debug.query}\n` +
          `- Days back: ${data.debug.daysBack}\n` +
          `- After date: ${data.debug.afterDate}\n` +
          `- Messages found with date filter: ${data.debug.messagesFound}\n` +
          `- Messages without date filter: ${data.debug.messagesWithoutDateFilter}\n` +
          `- PDF attachments extracted: ${data.debug.pdfAttachmentsFound}`
        : ''

      const processingLog = data.processingLog && data.processingLog.length > 0
        ? `\n\nProcessing Log:\n${data.processingLog.join('\n')}`
        : ''

      alert(`Sync complete! Found ${data.documentsFound} new documents, skipped ${data.duplicatesSkipped} duplicates.${debugMsg}${processingLog}`)
    } catch (error) {
      console.error('Sync error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to sync emails. Please try again.'
      alert(`Sync failed: ${errorMessage}`)
    } finally {
      setIsSyncing(false)
    }
  }

  return (
    <Button
      onClick={handleSync}
      disabled={isSyncing}
      variant="default"
    >
      {isSyncing ? (
        <>
          <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
          Syncing...
        </>
      ) : (
        <>
          <svg
            className="mr-2 h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
            />
          </svg>
          Sync Emails
        </>
      )}
    </Button>
  )
}
