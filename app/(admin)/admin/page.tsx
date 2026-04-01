import { requireAuthenticatedOwner } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Users, Mail, RefreshCw, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react'

export default async function AdminPage() {
  const { supabase, user } = await requireAuthenticatedOwner('/login')

  // Check admin role (layout already does this, but double-check)
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'admin') {
    redirect('/dashboard')
  }

  // Fetch admin stats from view
  const { data: stats } = await supabase
    .from('admin_stats')
    .select('*')
    .single()

  // Fetch recent sync logs
  const { data: syncLogs } = await supabase
    .from('admin_sync_logs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(20)

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Stats Overview */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground mb-6">Estatísticas do Sistema</h1>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Utilizadores</p>
                  <p className="text-3xl font-bold text-foreground">
                    {stats?.total_users || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                  <Mail className="h-6 w-6 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Contas Gmail</p>
                  <p className="text-3xl font-bold text-foreground">
                    {stats?.connected_accounts || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
                  <RefreshCw className="h-6 w-6 text-info" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Sincs. Activas</p>
                  <p className="text-3xl font-bold text-foreground">
                    {stats?.active_syncs || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-warning/10">
                  <FileText className="h-6 w-6 text-warning" />
                </div>
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Docs. Pendentes</p>
                  <p className="text-3xl font-bold text-foreground">
                    {stats?.total_pending_documents || 0}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Today's Activity */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Sincs. Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats?.syncs_completed_today || 0}</span>
              <span className="text-sm text-muted-foreground">concluídas</span>
            </div>
            {(stats?.syncs_failed_today || 0) > 0 && (
              <p className="text-sm text-destructive mt-1">
                {stats?.syncs_failed_today} falhadas
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Docs. Processados Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats?.documents_processed_today || 0}</span>
              <span className="text-sm text-muted-foreground">documentos</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Utilizadores Activos Hoje</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-bold">{stats?.active_users_today || 0}</span>
              <span className="text-sm text-muted-foreground">utilizadores</span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sync Logs */}
      <Card>
        <CardHeader>
          <CardTitle>Registo de Sincronizações</CardTitle>
          <CardDescription>
            Últimas 20 sincronizações do sistema (apenas metadados, sem dados de utilizadores)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {syncLogs && syncLogs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Estado</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Início</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Duração</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Emails</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Docs.</th>
                    <th className="py-3 px-4 text-left font-medium text-muted-foreground">Duplicados</th>
                  </tr>
                </thead>
                <tbody>
                  {syncLogs.map((log) => (
                    <tr key={log.id} className="border-b last:border-0">
                      <td className="py-3 px-4">
                        {log.status === 'completed' && (
                          <Badge variant="success" className="gap-1">
                            <CheckCircle className="h-3 w-3" />
                            Concluído
                          </Badge>
                        )}
                        {log.status === 'running' && (
                          <Badge variant="info" className="gap-1">
                            <RefreshCw className="h-3 w-3 animate-spin" />
                            Em curso
                          </Badge>
                        )}
                        {log.status === 'failed' && (
                          <Badge variant="destructive" className="gap-1">
                            <AlertCircle className="h-3 w-3" />
                            Falhou
                          </Badge>
                        )}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(log.started_at).toLocaleString('pt-PT', {
                          day: '2-digit',
                          month: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {log.duration_seconds ? `${log.duration_seconds}s` : '-'}
                      </td>
                      <td className="py-3 px-4">{log.emails_scanned}</td>
                      <td className="py-3 px-4">{log.documents_found}</td>
                      <td className="py-3 px-4 text-muted-foreground">{log.duplicates_skipped}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-center text-muted-foreground py-8">
              Ainda não existem registos de sincronização.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
