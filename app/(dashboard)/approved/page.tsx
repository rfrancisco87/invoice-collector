import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ApprovedDocumentList } from '@/components/approved-document-list'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { FileCheck, FileText, Receipt, Files } from 'lucide-react'

export default async function ApprovedPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch approved documents
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .order('received_date', { ascending: false })

  // Get counts by classification
  const { count: invoiceCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .eq('final_classification', 'invoice')

  const { count: creditNoteCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .eq('final_classification', 'credit_note')

  const { count: otherCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .eq('final_classification', 'unclassified')

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Stats */}
      <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-success/10">
                <FileCheck className="h-6 w-6 text-success" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Total Aprovados</p>
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
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10">
                <Receipt className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Faturas</p>
                <p className="text-3xl font-bold text-foreground">
                  {invoiceCount || 0}
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
                <p className="text-sm font-medium text-muted-foreground">Notas de Crédito</p>
                <p className="text-3xl font-bold text-foreground">
                  {creditNoteCount || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted">
                <Files className="h-6 w-6 text-muted-foreground" />
              </div>
              <div>
                <p className="text-sm font-medium text-muted-foreground">Outros</p>
                <p className="text-3xl font-bold text-foreground">
                  {otherCount || 0}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Document List */}
      <Card>
        <CardHeader>
          <CardTitle>Documentos Aprovados</CardTitle>
          <CardDescription>
            Veja todas as faturas e documentos aprovados
          </CardDescription>
        </CardHeader>
        {documents && documents.length > 0 ? (
          <ApprovedDocumentList documents={documents} />
        ) : (
          <CardContent>
            <p className="text-center text-muted-foreground py-8">
              Ainda não tem documentos aprovados.
            </p>
          </CardContent>
        )}
      </Card>
    </div>
  )
}
