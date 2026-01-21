import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { LogoutButton } from '@/components/logout-button'
import { SettingsForm } from '@/components/settings-form'
import Link from 'next/link'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b bg-white">
        <div className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">
                Settings
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
              className="border-b-2 border-transparent px-1 py-4 text-sm font-medium text-gray-500 hover:border-gray-300 hover:text-gray-700"
            >
              Approved
            </Link>
            <Link
              href="/settings"
              className="border-b-2 border-blue-500 px-1 py-4 text-sm font-medium text-blue-600"
            >
              Settings
            </Link>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <SettingsForm settings={settings} userEmail={user.email || ''} />
      </div>
    </div>
  )
}
