import { redirect } from 'next/navigation'
import { requireCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { DocumentList } from '@/components/document-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Clock, FileCheck, Files } from 'lucide-react'

export const dynamic = 'force-dynamic'

export default async function DashboardPage() {
  const user = await requireCurrentUser('/dashboard')
  const supabase = createAdminClient()

  // Fetch pending documents
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('received_date', { ascending: false })

  // Fetch recent sync job
  const { data: recentSync } = await supabase
    .from('sync_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  // Check if Gmail is connected
  const { data: gmailAccount } = await supabase
    .from('gmail_accounts')
    .select('email')
    .eq('user_id', user.id)
    .single()

  const isGmailConnected = !!gmailAccount

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Sync Status */}
      {recentSync && (
        <Card className="mb-6 border-info/30 bg-info/5">
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-foreground">
                  Última sincronização: {new Date(recentSync.started_at).toLocaleString('pt-PT')}
                </p>
                <p className="text-sm text-muted-foreground">
                  {recentSync.documents_found} documentos encontrados, {recentSync.duplicates_skipped} duplicados ignorados
                </p>
              </div>
              {recentSync.status === 'running' && (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  <span className="text-sm text-foreground">A sincronizar...</span>
                </div>
              )}
              {recentSync.status === 'completed' && (
                <Badge variant="success">Concluído</Badge>
              )}
              {recentSync.status === 'failed' && (
                <Badge variant="destructive">Falhou</Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                <Clock className="h-6 w-6 text-warning" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Pendentes</p>
                <p className="text-3xl font-bold text-foreground">
                  {documents?.length || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
                <Files className="h-6 w-6 text-info" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Emails Analisados</p>
                <p className="text-3xl font-bold text-foreground">
                  {recentSync?.emails_scanned || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <FileCheck className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Duplicados Ignorados</p>
                <p className="text-3xl font-bold text-foreground">
                  {recentSync?.duplicates_skipped || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document List */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos Pendentes</CardTitle>
          <CardDescription>
            Reveja e aprove ou rejeite os documentos
          </CardDescription>
        </CardHeader>
        {!isGmailConnected ? (
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Conecte a sua conta Gmail para começar a recolher faturas.
            </p>
          </CardContent>
        ) : documents && documents.length > 0 ? (
          <DocumentList documents={documents} />
        ) : (
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Não existem documentos pendentes. Clique em &quot;Sincronizar&quot; para procurar novas faturas.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
