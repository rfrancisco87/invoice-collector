'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Mail, X } from 'lucide-react'
import { useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'

interface GmailBannerProps {
  isConnected: boolean
  email?: string | null
}

export function GmailBanner({ isConnected, email }: GmailBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false)

  if (isConnected || isDismissed) {
    return null
  }

  return (
    <div className="border-b bg-warning/10 px-4 py-3">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-warning/20">
              <Mail className="h-4 w-4 text-warning" />
            </div>
            <div>
              <p className="text-sm font-medium text-foreground">
                Conecte a sua conta Gmail para começar a recolher faturas
              </p>
              <p className="text-xs text-muted-foreground">
                Precisa de autorizar o acesso ao Gmail e Google Drive
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/gmail-connect">
              <Button size="sm" variant="default">
                <Mail className="mr-2 h-4 w-4" />
                Conectar Gmail
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsDismissed(true)}
              className="h-8 w-8 p-0 hover:bg-warning/20"
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Fechar</span>
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
