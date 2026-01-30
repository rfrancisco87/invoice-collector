'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { useRouter } from 'next/navigation'
import { RefreshCw } from 'lucide-react'
import toast from 'react-hot-toast'

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
        throw new Error(data.details || data.error || 'Falha na sincronização')
      }

      toast.success(`Sincronização concluída: ${data.documentsFound || 0} documentos encontrados`)
      router.refresh()
    } catch (error) {
      console.error('Sync error:', error)
      const errorMessage = error instanceof Error ? error.message : 'Falha ao sincronizar emails. Tente novamente.'
      toast.error(errorMessage)
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
      <RefreshCw className={`mr-2 h-4 w-4 ${isSyncing ? 'animate-spin' : ''}`} />
      {isSyncing ? 'A sincronizar...' : 'Sincronizar'}
    </Button>
  )
}
