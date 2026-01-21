import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/logout-button'
import { SyncButton } from '@/components/sync-button'
import { DocumentList } from '@/components/document-list'
import Link from 'next/link'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Fetch pending documents
  const { data: documents } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .eq('status', 'pending')
    .order('received_date', { ascending: false })

  // Fetch recent sync jobs
  const { data: recentSync} = await supabase
    .from('sync_jobs')
    .select('*')
    .eq('user_id', user.id)
    .order('started_at', { ascending: false })
    .limit(1)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Invoice Dashboard
              </h1>
              <p className="mt-1 text-sm text-gray-600">
                {user.email}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <SyncButton />
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
              className="border-b-2 border-blue-500 px-1 py-4 text-sm font-medium text-blue-600"
            >
              Pending
            </Link>
            <Link
              href="/approved"
              className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Approved
            </Link>
            <Link
              href="/settings"
              className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Settings
            </Link>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Sync Status */}
        {recentSync && (
          <div className="mb-6 rounded-lg bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-blue-900">
                  Last sync: {new Date(recentSync.started_at).toLocaleString()}
                </p>
                <p className="text-sm text-blue-700">
                  {recentSync.documents_found} documents found, {recentSync.duplicates_skipped} duplicates skipped
                </p>
              </div>
              {recentSync.status === 'running' && (
                <div className="flex items-center gap-2">
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
                  <span className="text-sm text-blue-900">Syncing...</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Pending Approval</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {documents?.length || 0}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Total Synced</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {recentSync?.emails_scanned || 0}
            </p>
          </div>
          <div className="rounded-lg bg-white p-6 shadow">
            <p className="text-sm font-medium text-gray-600">Duplicates Skipped</p>
            <p className="mt-2 text-3xl font-bold text-gray-900">
              {recentSync?.duplicates_skipped || 0}
            </p>
          </div>
        </div>

        {/* Document List */}
        <div className="rounded-lg bg-white shadow">
          <div className="border-b px-6 py-4">
            <h2 className="text-lg font-semibold text-gray-900">
              Pending Documents
            </h2>
            <p className="mt-1 text-sm text-gray-600">
              Review and approve or reject documents
            </p>
          </div>

          <DocumentList documents={documents || []} />
        </div>
      </div>
    </div>
  )
}
