'use client'

import { useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Mail, CheckCircle, AlertCircle, ArrowRight, Unplug } from 'lucide-react'
import Link from 'next/link'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function GmailConnectContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const error = searchParams.get('error')

  const [gmailAccount, setGmailAccount] = useState<{ email: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [disconnecting, setDisconnecting] = useState(false)
  const [showDisconnectDialog, setShowDisconnectDialog] = useState(false)

  useEffect(() => {
    async function checkGmailConnection() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        router.push('/login')
        return
      }

      const { data: account } = await supabase
        .from('gmail_accounts')
        .select('email')
        .eq('user_id', user.id)
        .single()

      setGmailAccount(account)
      setLoading(false)
    }

    checkGmailConnection()
  }, [router])

  const handleDisconnect = async () => {
    setDisconnecting(true)
    try {
      const response = await fetch('/api/gmail/disconnect', { method: 'POST' })
      if (response.ok) {
        setGmailAccount(null)
        setShowDisconnectDialog(false)
      }
    } catch (err) {
      console.error('Failed to disconnect:', err)
    } finally {
      setDisconnecting(false)
    }
  }

  const getErrorMessage = (errorCode: string) => {
    const messages: Record<string, string> = {
      oauth_denied: 'Autorização Gmail recusada. Por favor tente novamente.',
      missing_params: 'Parâmetros em falta. Por favor tente novamente.',
      session_mismatch: 'Sessão expirada. Por favor inicie sessão novamente.',
      missing_tokens: 'Falha ao obter tokens. Por favor tente novamente.',
      no_email: 'Não foi possível obter o email Gmail.',
      db_error: 'Erro ao guardar dados. Por favor tente novamente.',
      callback_failed: 'Falha na conexão. Por favor tente novamente.',
    }
    return messages[errorCode] || 'Ocorreu um erro. Por favor tente novamente.'
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Mail className="h-6 w-6 text-primary" />
          </div>
          <CardTitle className="text-2xl">Ligação Gmail</CardTitle>
          <CardDescription>
            {gmailAccount
              ? 'A sua conta Gmail está ligada'
              : 'Ligue a sua conta Gmail para sincronizar faturas'}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
              <AlertCircle className="h-4 w-4 flex-shrink-0" />
              <span>{getErrorMessage(error)}</span>
            </div>
          )}

          {gmailAccount ? (
            <>
              <div className="flex items-center gap-3 rounded-lg border bg-muted/50 p-4">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <div>
                  <p className="font-medium">Conta ligada</p>
                  <p className="text-sm text-muted-foreground">{gmailAccount.email}</p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Link href="/dashboard">
                  <Button className="w-full">
                    Ir para o Painel
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </Link>

                <Button
                  variant="outline"
                  onClick={() => setShowDisconnectDialog(true)}
                  disabled={disconnecting}
                  className="w-full text-destructive hover:text-destructive"
                >
                  <Unplug className="mr-2 h-4 w-4" />
                  Desligar Gmail
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-3 text-sm text-muted-foreground">
                <p>Ao ligar a sua conta Gmail, poderá:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Sincronizar automaticamente faturas dos emails</li>
                  <li>Organizar documentos no Google Drive</li>
                  <li>Receber notificações de novas faturas</li>
                </ul>
              </div>

              <Button asChild className="w-full">
                <a href="/api/gmail/connect" className="flex items-center justify-center gap-2">
                  Ligar conta Gmail
                  <Mail className="h-4 w-4" />
                </a>
              </Button>

              <p className="text-xs text-center text-muted-foreground">
                Será redirecionado para o Google para autorizar o acesso.
                Apenas acedemos aos emails e Drive - nunca enviamos emails em seu nome.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Dialog open={showDisconnectDialog} onOpenChange={setShowDisconnectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desligar conta Gmail?</DialogTitle>
            <DialogDescription>
              Tem a certeza que pretende desligar a sua conta Gmail?
              A sincronização automática de faturas será interrompida.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDisconnectDialog(false)}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={handleDisconnect} disabled={disconnecting}>
              {disconnecting ? 'A desligar...' : 'Sim, desligar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default function GmailConnectPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      }
    >
      <GmailConnectContent />
    </Suspense>
  )
}
