import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/logout-button'
import { ApprovedDocumentList } from '@/components/approved-document-list'
import Link from 'next/link'

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
  const { data: invoiceCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .eq('final_classification', 'invoice')

  const { data: creditNoteCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .eq('final_classification', 'credit_note')

  const { data: otherCount } = await supabase
    .from('documents')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('status', 'approved')
    .eq('final_classification', 'other')

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Approved Documents
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {user.email}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                href="/dashboard"
                className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200"
              >
                Back to Dashboard
              </Link>
              <LogoutButton />
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-8" aria-label="Tabs">
            <Link
              href="/dashboard"
              className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Pending
            </Link>
            <Link
              href="/approved"
              className="border-b-2 border-blue-500 px-1 py-4 text-sm font-medium text-blue-600"
            >
              Approved
            </Link>
            <Link
              href="/settings"
              className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Settings
            </Link>
            <Link
              href="/admin"
              className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Admin
            </Link>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-4">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Total Approved</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {documents?.length || 0}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Invoices</p>
            <p className="mt-2 text-3xl font-bold text-green-600">
              {invoiceCount?.count || 0}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Credit Notes</p>
            <p className="mt-2 text-3xl font-bold text-orange-600">
              {creditNoteCount?.count || 0}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Other</p>
            <p className="mt-2 text-3xl font-bold text-gray-600">
              {otherCount?.count || 0}
            </p>
          </div>
        </div>

        {/* Document List */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Approved Documents
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              View all your approved invoices and documents
            </p>
          </div>

          <ApprovedDocumentList documents={documents || []} />
        </div>
      </div>
    </div>
  )
}
