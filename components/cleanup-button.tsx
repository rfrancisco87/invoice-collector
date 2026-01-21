'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'

export function CleanupButton() {
  const [isCleaningUp, setIsCleaningUp] = useState(false)
  const router = useRouter()

  const handleCleanup = async () => {
    const confirmed = confirm(
      'Are you sure you want to clean up ALL data? This will delete:\n' +
      '- All documents\n' +
      '- All sync history\n' +
      '- All user feedback\n' +
      '- All sender reputation data\n\n' +
      'This action cannot be undone!'
    )

    if (!confirmed) return

    try {
      setIsCleaningUp(true)

      const response = await fetch('/api/cleanup', {
        method: 'POST',
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.details || data.error || 'Cleanup failed')
      }

      // Refresh the page
      router.refresh()

      alert(
        `Database cleaned successfully!\n\n` +
        `Deleted:\n` +
        `- ${data.results.documents} documents\n` +
        `- ${data.results.syncJobs} sync jobs\n` +
        `- ${data.results.userFeedback} feedback entries\n` +
        `- ${data.results.senderReputation} reputation entries`
      )
    } catch (error) {
      console.error('Cleanup error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Failed to clean database'
      alert(`Cleanup failed: ${errorMessage}`)
    } finally {
      setIsCleaningUp(false)
    }
  }

  return (
    <Button
      onClick={handleCleanup}
      disabled={isCleaningUp}
      variant="destructive"
    >
      {isCleaningUp ? 'Cleaning...' : 'Clean Database'}
    </Button>
  )
}
