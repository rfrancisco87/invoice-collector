import { requireCurrentUser } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { RejectedDocumentList } from '@/components/rejected-document-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Bot, X } from 'lucide-react'

export default async function RejectedPage() {
  const user = await requireCurrentUser('/rejected')
  const supabase = createAdminClient()

  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'rejected')
    .order('rejected_at', { ascending: false })

  // @ts-ignore - Supabase row types infer as never across this project
  const autoRejectedCount = documents?.filter((d: any) => d.auto_action_reason).length ?? 0
  const manualRejectedCount = (documents?.length ?? 0) - autoRejectedCount

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-destructive/10">
                <X className="h-6 w-6 text-destructive" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejeitados manualmente</p>
                <p className="text-3xl font-bold text-foreground">{manualRejectedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-info/10">
                <Bot className="h-6 w-6 text-info" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Rejeitados automaticamente</p>
                <p className="text-3xl font-bold text-foreground">{autoRejectedCount}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Documentos Rejeitados</CardTitle>
          <CardDescription>
            Documentos rejeitados. Podem ser restaurados se a decisão estiver errada (rejeições manuais: até 30 dias).
          </CardDescription>
        </CardHeader>
        {documents && documents.length > 0 ? (
          <RejectedDocumentList documents={documents as any} />
        ) : (
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Ainda não tem documentos rejeitados.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
