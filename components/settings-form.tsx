'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bell, Mail, Clock, Check, Tag, Archive, AlertCircle } from 'lucide-react'
import Link from 'next/link'

interface Settings {
  sync_days_back: number
  auto_sync_enabled: boolean
  email_notifications_enabled: boolean
  notification_email: string | null
  last_auto_sync_at: string | null
  gmail_sync_label: string | null
  archive_synced_emails: boolean
  subscription_tier?: 'free' | 'paid'
  sync_frequency_minutes?: number
}

interface SettingsFormProps {
  settings: Settings | null
  userEmail: string
  gmailEmail?: string | null
}

export function SettingsForm({ settings, userEmail, gmailEmail }: SettingsFormProps) {
  const [formData, setFormData] = useState({
    sync_days_back: settings?.sync_days_back || 1,
    auto_sync_enabled: settings?.auto_sync_enabled ?? true,
    email_notifications_enabled: settings?.email_notifications_enabled ?? true,
    notification_email: settings?.notification_email || userEmail,
    gmail_sync_label: settings?.gmail_sync_label || 'Invoice Collector - Synced',
    archive_synced_emails: settings?.archive_synced_emails ?? false,
    subscription_tier: settings?.subscription_tier || 'free',
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setMessage(null)

      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorData = await response.json()
        console.error('Settings save error:', errorData)
        throw new Error(errorData.details || errorData.error || 'Falha ao guardar definições')
      }

      setMessage({ type: 'success', text: 'Definições guardadas com sucesso!' })

      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao guardar definições',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleSendTestEmail = async () => {
    try {
      setIsSendingTest(true)
      setMessage(null)

      const response = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'test_email' }),
      })

      if (!response.ok) {
        throw new Error('Falha ao enviar email de teste')
      }

      setMessage({ type: 'success', text: 'Email de teste enviado! Verifique a sua caixa de entrada.' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Falha ao enviar email de teste',
      })
    } finally {
      setIsSendingTest(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Message Banner */}
      {message && (
        <div
          className={`rounded-lg p-4 ${
            message.type === 'success'
              ? 'bg-success/10 text-success'
              : 'bg-destructive/10 text-destructive'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' ? (
              <Check className="h-5 w-5" />
            ) : (
              <AlertCircle className="h-5 w-5" />
            )}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        </div>
      )}

      {/* Gmail Account Section */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Mail className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Conta Gmail</h2>
        </div>

        {gmailEmail ? (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">{gmailEmail}</p>
                <p className="text-sm text-muted-foreground">Conta Gmail conectada</p>
              </div>
              <div className="flex gap-2">
                <Link href="/api/gmail/connect">
                  <Button variant="outline" size="sm">Reconectar</Button>
                </Link>
                <Link href="/gmail-connect">
                  <Button variant="ghost" size="sm">Gerir</Button>
                </Link>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Se tiver problemas com a sincronização, clique em &quot;Reconectar&quot; para renovar as permissões.
            </p>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Nenhuma conta Gmail conectada
            </p>
            <Link href="/gmail-connect">
              <Button size="sm">
                <Mail className="mr-2 h-4 w-4" />
                Conectar Gmail
              </Button>
            </Link>
          </div>
        )}
      </div>

      {/* Sync Settings */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Definições de Sincronização</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="sync_days_back">Sincronizar emails dos últimos (dias)</Label>
            <select
              id="sync_days_back"
              value={formData.sync_days_back}
              onChange={(e) => setFormData({ ...formData, sync_days_back: parseInt(e.target.value) })}
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="1">1 dia</option>
              <option value="2">2 dias</option>
              <option value="3">3 dias</option>
              <option value="7">1 semana</option>
              <option value="14">2 semanas</option>
              <option value="30">1 mês</option>
            </select>
            <p className="mt-1 text-sm text-muted-foreground">
              Quantos dias para trás procurar novas faturas ao sincronizar
            </p>
          </div>

          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input
                id="auto_sync_enabled"
                type="checkbox"
                checked={formData.auto_sync_enabled}
                onChange={(e) => setFormData({ ...formData, auto_sync_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
            </div>
            <div className="ml-3">
              <Label htmlFor="auto_sync_enabled">Activar sincronização automática</Label>
              <p className="text-sm text-muted-foreground">
                Sincronizar automaticamente os seus emails (frequência depende do plano)
              </p>
              {settings?.last_auto_sync_at && (
                <p className="mt-1 text-xs text-muted-foreground">
                  Última sync automática: {new Date(settings.last_auto_sync_at).toLocaleString('pt-PT')}
                </p>
              )}
            </div>
          </div>

          <div className="pt-4 border-t border-border">
            <Label htmlFor="subscription_tier">Plano de Subscrição</Label>
            <div className="mt-1 flex items-center gap-4">
              <select
                id="subscription_tier"
                value={formData.subscription_tier}
                onChange={(e) => setFormData({ ...formData, subscription_tier: e.target.value as 'free' | 'paid' })}
                className="block w-full max-w-xs rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="free">Gratuito (Sync a cada 12 horas)</option>
                <option value="paid">Pago (Sync a cada 15 minutos)</option>
              </select>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              Em produção, isto seria gerido pelo sistema de pagamentos.
            </p>
          </div>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Notificações por Email</h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input
                id="email_notifications_enabled"
                type="checkbox"
                checked={formData.email_notifications_enabled}
                onChange={(e) =>
                  setFormData({ ...formData, email_notifications_enabled: e.target.checked })
                }
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
            </div>
            <div className="ml-3">
              <Label htmlFor="email_notifications_enabled">Enviar notificações por email</Label>
              <p className="text-sm text-muted-foreground">
                Receber notificação quando novas faturas forem detectadas
              </p>
            </div>
          </div>

          {formData.email_notifications_enabled && (
            <>
              <div>
                <Label htmlFor="notification_email">Email para notificações</Label>
                <Input
                  type="email"
                  id="notification_email"
                  value={formData.notification_email}
                  onChange={(e) => setFormData({ ...formData, notification_email: e.target.value })}
                  placeholder={userEmail}
                  className="mt-1"
                />
                <p className="mt-1 text-sm text-muted-foreground">
                  Deixe em branco para usar o email da conta ({userEmail})
                </p>
              </div>

              <div>
                <Button
                  onClick={handleSendTestEmail}
                  disabled={isSendingTest}
                  variant="outline"
                >
                  <Mail className="mr-2 h-4 w-4" />
                  {isSendingTest ? 'A enviar...' : 'Enviar Email de Teste'}
                </Button>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Gmail Settings */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <Tag className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Definições do Gmail</h2>
        </div>

        <div className="space-y-4">
          <div>
            <Label htmlFor="gmail_sync_label">Etiqueta Gmail para Emails Sincronizados</Label>
            <Input
              type="text"
              id="gmail_sync_label"
              value={formData.gmail_sync_label}
              onChange={(e) => setFormData({ ...formData, gmail_sync_label: e.target.value })}
              placeholder="Invoice Collector - Synced"
              className="mt-1"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Esta etiqueta será criada no Gmail e aplicada a todos os emails sincronizados.
            </p>
          </div>

          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input
                id="archive_synced_emails"
                type="checkbox"
                checked={formData.archive_synced_emails}
                onChange={(e) => setFormData({ ...formData, archive_synced_emails: e.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
            </div>
            <div className="ml-3">
              <Label htmlFor="archive_synced_emails" className="flex items-center gap-1">
                <Archive className="h-4 w-4" />
                Arquivar emails sincronizados
              </Label>
              <p className="text-sm text-muted-foreground">
                Remover emails sincronizados da caixa de entrada. Continuarão acessíveis em &quot;Todos os emails&quot;.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-info/30 bg-info/5 p-4">
        <h3 className="text-sm font-medium text-foreground">Sobre a Sincronização Automática</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          A sincronização automática requer configuração de um cron job para chamar{' '}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">/api/cron/sync</code>.
          Consulte a documentação para instruções de configuração.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="px-8">
          {isSaving ? 'A guardar...' : 'Guardar Definições'}
        </Button>
      </div>
    </div>
  )
}
