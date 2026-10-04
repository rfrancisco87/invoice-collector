'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Bell, Mail, Clock, Check, Tag, Archive, AlertCircle, HardDrive, FolderInput, FolderCheck, FileText } from 'lucide-react'
import Link from 'next/link'
import { DriveFolderSelector } from './drive-folder-selector'
import { ApiKeyManager } from './api-key-manager'
import { RulesManager } from './rules-manager'
import {
  APPROVED_FILENAME_VARIABLES,
  DEFAULT_APPROVED_FILENAME_TEMPLATE,
  applyTemplate,
} from '@/lib/filename-template'
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
  inbox_folder_mode?: 'managed' | 'existing' | null
  approved_folder_id?: string | null
  approved_folder_name?: string | null
  approved_folder_mode?: 'managed' | 'existing' | null
  approved_filename_template?: string | null
  webhook_url?: string | null
  prefilter_enabled?: boolean
  classification_confidence_threshold?: number
  duplicate_pair_default?: 'ask' | 'invoice' | 'receipt' | 'both'
  auto_reject_enabled?: boolean
  auto_approve_enabled?: boolean
  classifier_backend?: 'webhook' | 'anthropic' | 'openai'
  classifier_model?: string | null
}

interface SettingsFormProps {
  settings: Settings | null
  userEmail: string
  gmailEmail?: string | null
}

export function SettingsForm({ settings, userEmail, gmailEmail }: SettingsFormProps) {
  const initialInboxMode: 'managed' | 'existing' =
    settings?.inbox_folder_enabled &&
      settings?.inbox_folder_id &&
      settings?.inbox_folder_name &&
      settings.inbox_folder_name !== 'Inbox'
      ? 'existing'
      : 'managed'

  const initialApprovedMode: 'managed' | 'existing' =
    settings?.approved_folder_mode === 'existing'
      ? 'existing'
      : 'managed'

  const [formData, setFormData] = useState({
    sync_days_back: settings?.sync_days_back || 1,
    auto_sync_enabled: settings?.auto_sync_enabled ?? true,
    email_notifications_enabled: settings?.email_notifications_enabled ?? true,
    notification_email: settings?.notification_email || userEmail,
    gmail_sync_label: settings?.gmail_sync_label || 'Invoice Collector - Synced',
    archive_synced_emails: settings?.archive_synced_emails ?? false,
    drive_folder_id: settings?.drive_folder_id || null,
    drive_folder_name: settings?.drive_folder_name || null,
    drive_folder_path: settings?.drive_folder_path || null,
    inbox_folder_id: settings?.inbox_folder_id || null,
    inbox_folder_name: settings?.inbox_folder_name || null,
    inbox_folder_enabled: settings?.inbox_folder_enabled ?? false,
    inbox_folder_mode: settings?.inbox_folder_mode || initialInboxMode,
    approved_folder_id: settings?.approved_folder_id || null,
    approved_folder_name: settings?.approved_folder_name || null,
    approved_folder_mode: settings?.approved_folder_mode || initialApprovedMode,
    approved_filename_template:
      settings?.approved_filename_template || DEFAULT_APPROVED_FILENAME_TEMPLATE,
    webhook_url: settings?.webhook_url || '',
    prefilter_enabled: settings?.prefilter_enabled ?? true,
    classification_confidence_threshold:
      settings?.classification_confidence_threshold ?? 0.7,
    duplicate_pair_default: settings?.duplicate_pair_default || 'invoice',
    auto_reject_enabled: settings?.auto_reject_enabled ?? true,
    auto_approve_enabled: settings?.auto_approve_enabled ?? false,
    classifier_backend: settings?.classifier_backend || 'webhook',
    classifier_model: settings?.classifier_model || '',
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
      settings?.inbox_folder_id &&
      initialInboxMode === 'managed'
    ) {
      setShowDeleteConfirm(true)
      return
    }

    if (
      formData.inbox_folder_enabled &&
      formData.inbox_folder_mode === 'existing' &&
      !formData.inbox_folder_id
    ) {
      setMessage({ type: 'error', text: 'Selecione uma pasta existente para a Inbox.' })
      return
    }

    if (
      formData.approved_folder_mode === 'existing' &&
      !formData.approved_folder_id
    ) {
      setMessage({ type: 'error', text: 'Selecione uma pasta existente para os ficheiros aprovados.' })
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
        body: JSON.stringify({
          action: 'test_email',
          notification_email: formData.notification_email,
        }),
      })

      if (!response.ok) {
        const data = await response.json().catch(() => null)
        throw new Error(data?.details || data?.error || 'Falha ao enviar email de teste')
      }

      const data = await response.json().catch(() => null)
      setMessage({
        type: 'success',
        text: data?.message || 'Email de teste enviado! Verifique a sua caixa de entrada.'
      })
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

          {/* Approved Folder Option */}
          <div className="pt-4 border-t border-border space-y-4">
            <div className="flex items-center gap-3">
              <FolderCheck className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Pasta de Ficheiros Aprovados</h3>
            </div>

            <div className="space-y-3 ml-8">
              <div className="flex items-center gap-2">
                <input
                  id="approved_mode_managed"
                  type="radio"
                  name="approved_folder_mode"
                  checked={formData.approved_folder_mode === 'managed'}
                  onChange={() => setFormData(prev => ({
                    ...prev,
                    approved_folder_mode: 'managed',
                  }))}
                  className="h-4 w-4 border-input text-primary focus:ring-primary"
                />
                <Label htmlFor="approved_mode_managed">Criar automaticamente dentro da pasta principal</Label>
              </div>
              <div className="flex items-center gap-2">
                <input
                  id="approved_mode_existing"
                  type="radio"
                  name="approved_folder_mode"
                  checked={formData.approved_folder_mode === 'existing'}
                  onChange={() => setFormData(prev => ({
                    ...prev,
                    approved_folder_mode: 'existing',
                    approved_folder_id: null,
                    approved_folder_name: null,
                  }))}
                  className="h-4 w-4 border-input text-primary focus:ring-primary"
                />
                <Label htmlFor="approved_mode_existing">Usar uma pasta existente do Google Drive</Label>
              </div>

              {formData.approved_folder_mode === 'managed' ? (
                <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground border border-border">
                  <p>
                    A pasta <strong>Approved</strong> será criada e mantida automaticamente dentro da sua pasta principal:
                  </p>
                  <div className="mt-2 flex items-center gap-2 font-medium text-foreground">
                    <FolderCheck className="h-4 w-4" />
                    <span>{formData.drive_folder_name || 'Pasta Principal'} / Approved</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Selecione a pasta onde os ficheiros aprovados serão movidos.
                  </p>
                  <DriveFolderSelector
                    currentFolderId={formData.approved_folder_id}
                    currentFolderName={formData.approved_folder_name}
                    onSelect={(id, name) => setFormData(prev => ({
                      ...prev,
                      approved_folder_id: id,
                      approved_folder_name: name,
                    }))}
                  />
                </div>
              )}
            </div>
          </div>

          {/* Approved Filename Template */}
          <div className="pt-4 border-t border-border space-y-4">
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-primary" />
              <h3 className="text-sm font-semibold text-foreground">Renomear Ficheiros Aprovados</h3>
            </div>

            <div className="ml-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                Modelo aplicado ao nome do ficheiro quando uma fatura é aprovada.
                Pode usar variáveis entre chavetas. Variáveis sem valor são omitidas
                juntamente com o separador anterior.
              </p>

              <div className="space-y-2">
                <Label htmlFor="approved_filename_template">Modelo</Label>
                <Input
                  id="approved_filename_template"
                  type="text"
                  value={formData.approved_filename_template ?? ''}
                  placeholder={DEFAULT_APPROVED_FILENAME_TEMPLATE}
                  onChange={(e) => setFormData(prev => ({
                    ...prev,
                    approved_filename_template: e.target.value,
                  }))}
                />
                <div className="flex flex-wrap gap-1.5">
                  {APPROVED_FILENAME_VARIABLES.map((v) => {
                    const token = `{${v}}`
                    return (
                      <button
                        key={v}
                        type="button"
                        onClick={() => setFormData(prev => ({
                          ...prev,
                          approved_filename_template: (prev.approved_filename_template || '') + token,
                        }))}
                        className="rounded border border-border bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                      >
                        {token}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="rounded-md border border-border bg-muted p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
                  Pré-visualização
                </p>
                <p className="text-sm font-mono text-foreground break-all">
                  {(() => {
                    const sample = {
                      supplier_name: 'ACME Lda',
                      vat_number: 'PT123456789',
                      month: '04',
                      year: '2026',
                      invoice_number: 'FT 2026/47',
                      invoice_total: '1250.00',
                      currency: 'EUR',
                    }
                    const rendered = applyTemplate(
                      formData.approved_filename_template || DEFAULT_APPROVED_FILENAME_TEMPLATE,
                      sample,
                    )
                    return rendered ? `${rendered}.pdf` : '(vazio — será mantido o nome original)'
                  })()}
                </p>
              </div>
            </div>
          </div>
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
            <div className="ml-6 space-y-4">
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    id="inbox_mode_managed"
                    type="radio"
                    name="inbox_folder_mode"
                    checked={formData.inbox_folder_mode === 'managed'}
                    onChange={() => setFormData(prev => ({
                      ...prev,
                      inbox_folder_mode: 'managed',
                    }))}
                    className="h-4 w-4 border-input text-primary focus:ring-primary"
                  />
                  <Label htmlFor="inbox_mode_managed">Criar e gerir pasta Inbox automaticamente</Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    id="inbox_mode_existing"
                    type="radio"
                    name="inbox_folder_mode"
                    checked={formData.inbox_folder_mode === 'existing'}
                    onChange={() => setFormData(prev => ({
                      ...prev,
                      inbox_folder_mode: 'existing',
                    }))}
                    className="h-4 w-4 border-input text-primary focus:ring-primary"
                  />
                  <Label htmlFor="inbox_mode_existing">Usar uma pasta existente do Google Drive</Label>
                </div>
              </div>

              {formData.inbox_folder_mode === 'managed' ? (
                <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground border border-border">
                  <p>
                    A pasta <strong>Inbox</strong> será criada e mantida automaticamente dentro da sua pasta principal do Google Drive:
                  </p>
                  <div className="mt-2 flex items-center gap-2 font-medium text-foreground">
                    <FolderInput className="h-4 w-4" />
                    <span>{formData.drive_folder_name || 'Pasta Principal'} / Inbox</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Selecione a pasta existente para monitorizar PDFs enviados manualmente.
                  </p>
                  <DriveFolderSelector
                    currentFolderId={formData.inbox_folder_id}
                    currentFolderName={formData.inbox_folder_name}
                    onSelect={(id, name) => setFormData(prev => ({
                      ...prev,
                      inbox_folder_id: id,
                      inbox_folder_name: name,
                    }))}
                  />
                </div>
              )}
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
            {/* Read-only: the tier is a billing entitlement and the settings API
                no longer accepts it from the client. */}
            <p className="text-sm font-medium text-foreground">Plano de Subscrição</p>
            <p className="mt-1 text-sm text-foreground">
              {settings?.subscription_tier === 'paid'
                ? 'Pago (Sync a cada 15 minutos)'
                : 'Gratuito (Sync a cada 12 horas)'}
            </p>
            <p className="mt-1 text-sm text-muted-foreground">
              O plano é gerido pelo sistema de pagamentos.
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

      {/* Classification */}
      <div className="rounded-lg border bg-card p-6">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-foreground">Classificação de Documentos</h2>
          <p className="text-sm text-muted-foreground">
            Controla como os documentos são filtrados e classificados antes de chegarem à sua lista.
          </p>
        </div>

        <div className="space-y-5">
          <div>
            <Label htmlFor="classifier_backend">Motor de classificação</Label>
            <select
              id="classifier_backend"
              value={formData.classifier_backend}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  classifier_backend: e.target.value as NonNullable<
                    Settings['classifier_backend']
                  >,
                })
              }
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="webhook">Webhook (n8n)</option>
              <option value="anthropic">Anthropic (Claude)</option>
              <option value="openai">OpenAI</option>
            </select>
            <p className="mt-1 text-sm text-muted-foreground">
              Para usar Anthropic ou OpenAI tem de adicionar primeiro a chave de API abaixo.
              Os custos são cobrados na sua conta do fornecedor.
            </p>
          </div>

          <div>
            <Label htmlFor="classifier_model">Modelo (opcional)</Label>
            <Input
              type="text"
              id="classifier_model"
              value={formData.classifier_model}
              onChange={(e) => setFormData({ ...formData, classifier_model: e.target.value })}
              placeholder="Deixe vazio para usar o modelo predefinido"
              className="mt-1 font-mono"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Só necessário se o modelo predefinido não estiver disponível na sua conta.
            </p>
          </div>

          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input
                id="prefilter_enabled"
                type="checkbox"
                checked={formData.prefilter_enabled}
                onChange={(e) => setFormData({ ...formData, prefilter_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
            </div>
            <div className="ml-3">
              <Label htmlFor="prefilter_enabled">Filtro prévio de documentos</Label>
              <p className="text-sm text-muted-foreground">
                Descarta extratos bancários, contratos, recibos de vencimento e bilhetes antes de
                serem enviados para classificação. Só descarta quando não há qualquer sinal de
                fatura no nome ou assunto.
              </p>
            </div>
          </div>

          <div>
            <Label htmlFor="duplicate_pair_default">Fatura e recibo no mesmo email</Label>
            <select
              id="duplicate_pair_default"
              value={formData.duplicate_pair_default}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  duplicate_pair_default: e.target.value as NonNullable<
                    Settings['duplicate_pair_default']
                  >,
                })
              }
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="invoice">Guardar apenas a fatura (recomendado)</option>
              <option value="receipt">Guardar apenas o recibo</option>
              <option value="both">Guardar ambos</option>
              <option value="ask">Perguntar sempre</option>
            </select>
            <p className="mt-1 text-sm text-muted-foreground">
              Alguns fornecedores (como a Stripe) enviam fatura e recibo do mesmo pagamento.
              Em Portugal normalmente só a fatura é necessária.
            </p>
          </div>

          <div>
            <Label htmlFor="classification_confidence_threshold">
              Limite de confiança: {Math.round(formData.classification_confidence_threshold * 100)}%
            </Label>
            <input
              id="classification_confidence_threshold"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={formData.classification_confidence_threshold}
              onChange={(e) =>
                setFormData({
                  ...formData,
                  classification_confidence_threshold: Number(e.target.value),
                })
              }
              className="mt-2 w-full accent-primary"
            />
            <p className="mt-1 text-sm text-muted-foreground">
              Classificações abaixo deste valor são marcadas para revisão em vez de aceites
              automaticamente. Valores mais altos significam mais documentos a rever, mas menos
              erros aceites em silêncio.
            </p>
          </div>

          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input
                id="auto_reject_enabled"
                type="checkbox"
                checked={formData.auto_reject_enabled}
                onChange={(e) => setFormData({ ...formData, auto_reject_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
              />
            </div>
            <div className="ml-3">
              <Label htmlFor="auto_reject_enabled">Rejeição automática</Label>
              <p className="text-sm text-muted-foreground">
                Rejeita automaticamente ficheiros idênticos a outros que já rejeitou, e documentos
                de remetentes que rejeita consistentemente.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/*
        Keys save through their own endpoint, not the main form: the plaintext
        key is validated against the provider and encrypted server-side, so it
        must not ride along in the general settings PATCH payload.
      */}
      <ApiKeyManager />

      <RulesManager />

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
                  A pasta &quot;Inbox&quot; será <strong>ELIMINADA PERMANENTEMENTE</strong> do seu Google Drive.
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
