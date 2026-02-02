'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bell, Mail, Clock, Check, Tag, Archive, AlertCircle, HardDrive, FolderInput } from 'lucide-react'
import Link from 'next/link'
import { DriveFolderSelector } from './drive-folder-selector'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

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
  drive_folder_id?: string | null
  drive_folder_name?: string | null
  drive_folder_path?: string | null
  inbox_folder_id?: string | null
  inbox_folder_name?: string | null
  inbox_folder_enabled?: boolean
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
    drive_folder_id: settings?.drive_folder_id || null,
    drive_folder_name: settings?.drive_folder_name || null,
    drive_folder_path: settings?.drive_folder_path || null,
    inbox_folder_id: settings?.inbox_folder_id || null,
    inbox_folder_name: settings?.inbox_folder_name || null,
    inbox_folder_enabled: settings?.inbox_folder_enabled ?? false,
  })
  const [isSaving, setIsSaving] = useState(false)
  const [isSendingTest, setIsSendingTest] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)

  const handleSave = async () => {
    // Check if disabling inbox sync
    if (
      settings?.inbox_folder_enabled &&
      !formData.inbox_folder_enabled &&
      settings?.inbox_folder_id
    ) {
      setShowDeleteConfirm(true)
      return
    }

    await performSave()
  }

  const performSave = async () => {

    try {
      setIsSaving(true)
      setMessage(null)

      const response = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error('Settings save error raw:', errorText)
        let errorData = {}
        try {
          errorData = JSON.parse(errorText)
        } catch (e) {
          errorData = { details: errorText || 'Unknown server error' }
        }
        console.error('Settings save error data:', errorData)
        // @ts-ignore
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
          className={`rounded-lg p-4 ${message.type === 'success'
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

      {/* Google Drive Folder Section */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <HardDrive className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Google Drive</h2>
        </div>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Escolha a pasta do Google Drive onde as faturas serão guardadas.
          </p>

          <DriveFolderSelector
            currentFolderId={formData.drive_folder_id}
            currentFolderName={formData.drive_folder_name}
            onSelect={(id, name, path) => setFormData(prev => ({
              ...prev,
              drive_folder_id: id,
              drive_folder_name: name,
              drive_folder_path: path
            }))}
          />
        </div>
      </div>

      {/* Inbox Folder Section */}
      <div className="rounded-lg border bg-card p-6">
        <div className="flex items-center gap-3 mb-4">
          <FolderInput className="h-6 w-6 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">
            Pasta de Entrada (Inbox)
          </h2>
        </div>

        <div className="space-y-4">
          <div className="flex items-center space-x-2">
            <input
              id="inbox_folder_enabled"
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
              checked={formData.inbox_folder_enabled}
              onChange={(e) => setFormData(prev => ({
                ...prev,
                inbox_folder_enabled: e.target.checked
              }))}
            />
            <Label htmlFor="inbox_folder_enabled" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
              Ativar sincronização da pasta de entrada
            </Label>
          </div>
          <p className="text-sm text-muted-foreground ml-6">
            Sincronizar PDFs adicionados manualmente a uma pasta do Drive
          </p>

          {formData.inbox_folder_enabled && (
            <div className="ml-6 p-3 bg-muted rounded-md text-sm text-muted-foreground border border-border">
              <p>
                A pasta <strong>Inbox</strong> será criada e mantida automaticamente dentro da sua pasta principal do Google Drive:
              </p>
              <div className="mt-2 flex items-center gap-2 font-medium text-foreground">
                <FolderInput className="h-4 w-4" />
                <span>{formData.drive_folder_name || 'Pasta Principal'} / Inbox</span>
              </div>
            </div>
          )}
        </div>
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

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="px-8">
          {isSaving ? 'A guardar...' : 'Guardar Definições'}
        </Button>
      </div>

      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Desativar Sincronização da Inbox?</DialogTitle>
            <DialogDescription className="pt-4 space-y-2">
              <p>
                Tem a certeza que deseja desativar a sincronização da pasta de entrada?
              </p>
              <div className="p-3 bg-destructive/10 text-destructive rounded-md text-sm border border-destructive/20">
                <p className="font-semibold flex items-center gap-2">
                  <AlertCircle className="h-4 w-4" />
                  ATENÇÃO
                </p>
                <p className="mt-1">
                  A pasta "Inbox" será <strong>ELIMINADA PERMANENTEMENTE</strong> do seu Google Drive.
                  Os ficheiros que estiverem dentro dela também poderão ser perdidos.
                </p>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setShowDeleteConfirm(false)
                performSave()
              }}
            >
              Sim, desativar e eliminar pasta
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  )
}

