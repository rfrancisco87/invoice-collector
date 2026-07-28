'use client'

import { useCallback, useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Copy, Plus, Ticket, X } from 'lucide-react'

type InviteStatus = 'active' | 'used' | 'revoked' | 'expired'

interface Invite {
  id: string
  code: string
  email: string | null
  status: InviteStatus
  used_at: string | null
  revoked_at: string | null
  expires_at: string
  created_at: string
}

const STATUS_LABELS: Record<InviteStatus, string> = {
  active: 'Por usar',
  used: 'Utilizado',
  revoked: 'Revogado',
  expired: 'Expirado',
}

const STATUS_VARIANTS: Record<InviteStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  active: 'default',
  used: 'secondary',
  revoked: 'destructive',
  expired: 'outline',
}

export function InviteManager() {
  const [invites, setInvites] = useState<Invite[]>([])
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)

  const loadInvites = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/invites')
      if (!response.ok) throw new Error('Failed to load invites')

      const data = await response.json()
      setInvites(data.invites ?? [])
    } catch {
      toast.error('Falha ao carregar convites')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadInvites()
  }, [loadInvites])

  const createInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)

    try {
      const response = await fetch('/api/admin/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() || undefined }),
      })

      const data = await response.json().catch(() => null)

      if (!response.ok) {
        toast.error(data?.error || 'Falha ao criar convite')
        return
      }

      // The email is best-effort on the server, so say which happened rather
      // than implying the invite was delivered when it was only created.
      toast.success(
        data.emailed
          ? `Convite enviado para ${email.trim()}`
          : `Convite criado: ${data.invite.code}`
      )

      setEmail('')
      await loadInvites()
    } catch {
      toast.error('Falha ao criar convite')
    } finally {
      setCreating(false)
    }
  }

  const revokeInvite = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/invites?id=${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        toast.error(data?.error || 'Falha ao revogar convite')
        return
      }

      toast.success('Convite revogado')
      await loadInvites()
    } catch {
      toast.error('Falha ao revogar convite')
    }
  }

  const copyCode = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code)
      toast.success('Código copiado')
    } catch {
      toast.error('Não foi possível copiar')
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Ticket className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle>Convites</CardTitle>
            <CardDescription>
              O registo é por convite. Cada código serve uma conta e expira em 14 dias.
            </CardDescription>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        <form onSubmit={createInvite} className="space-y-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1 space-y-2">
              <Label htmlFor="inviteEmail">Email (opcional)</Label>
              <Input
                id="inviteEmail"
                type="email"
                placeholder="pessoa@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={creating}
              />
            </div>
            <Button type="submit" disabled={creating} className="gap-2">
              <Plus className="h-4 w-4" />
              {creating ? 'A criar...' : 'Criar convite'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Com email, o convite é enviado e só pode ser usado por esse endereço.
            Sem email, gera um código para partilhar manualmente.
          </p>
        </form>

        <div className="space-y-2">
          {loading ? (
            <p className="py-6 text-center text-sm text-muted-foreground">A carregar convites...</p>
          ) : invites.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Ainda não existem convites.
            </p>
          ) : (
            invites.map((invite) => (
              <div
                key={invite.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <code className="font-mono text-sm font-semibold tracking-wider">
                      {invite.code}
                    </code>
                    <Badge variant={STATUS_VARIANTS[invite.status]}>
                      {STATUS_LABELS[invite.status]}
                    </Badge>
                  </div>
                  <p className="truncate text-xs text-muted-foreground">
                    {invite.email ?? 'Sem email associado'}
                    {' · '}
                    {invite.status === 'used'
                      ? `usado a ${formatDate(invite.used_at)}`
                      : `expira a ${formatDate(invite.expires_at)}`}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyCode(invite.code)}
                    className="gap-1"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                  {invite.status === 'active' && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => revokeInvite(invite.id)}
                      className="gap-1 text-destructive hover:text-destructive"
                    >
                      <X className="h-3 w-3" />
                      Revogar
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('pt-PT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}
