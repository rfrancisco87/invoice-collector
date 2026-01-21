'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Bell, Mail, Clock, Check } from 'lucide-react'

interface Settings {
  sync_days_back: number
  auto_sync_enabled: boolean
  email_notifications_enabled: boolean
  notification_email: string | null
  last_auto_sync_at: string | null
}

interface SettingsFormProps {
  settings: Settings | null
  userEmail: string
}

export function SettingsForm({ settings, userEmail }: SettingsFormProps) {
  const [formData, setFormData] = useState({
    sync_days_back: settings?.sync_days_back || 1,
    auto_sync_enabled: settings?.auto_sync_enabled ?? true,
    email_notifications_enabled: settings?.email_notifications_enabled ?? true,
    notification_email: settings?.notification_email || userEmail,
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
        throw new Error('Failed to save settings')
      }

      setMessage({ type: 'success', text: 'Settings saved successfully!' })

      // Reload the page to get updated data
      setTimeout(() => {
        window.location.reload()
      }, 1500)
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
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
        throw new Error('Failed to send test email')
      }

      setMessage({ type: 'success', text: 'Test email sent! Check your inbox.' })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to send test email',
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
            message.type === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-800'
          }`}
        >
          <div className="flex items-center gap-2">
            {message.type === 'success' && <Check className="h-5 w-5" />}
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        </div>
      )}

      {/* Sync Settings */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-center gap-3 mb-4">
          <Clock className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Sync Settings</h2>
        </div>

        <div className="space-y-4">
          <div>
            <label htmlFor="sync_days_back" className="block text-sm font-medium text-gray-700">
              Sync emails from the last (days)
            </label>
            <select
              id="sync_days_back"
              value={formData.sync_days_back}
              onChange={(e) => setFormData({ ...formData, sync_days_back: parseInt(e.target.value) })}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
            >
              <option value="1">1 day</option>
              <option value="2">2 days</option>
              <option value="3">3 days</option>
              <option value="7">1 week</option>
              <option value="14">2 weeks</option>
              <option value="30">1 month</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              How far back to look for new invoices when syncing
            </p>
          </div>

          <div className="flex items-start">
            <div className="flex h-5 items-center">
              <input
                id="auto_sync_enabled"
                type="checkbox"
                checked={formData.auto_sync_enabled}
                onChange={(e) => setFormData({ ...formData, auto_sync_enabled: e.target.checked })}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="ml-3">
              <label htmlFor="auto_sync_enabled" className="font-medium text-gray-700">
                Enable automatic sync
              </label>
              <p className="text-sm text-gray-500">
                Automatically sync your emails every hour (requires cron job setup)
              </p>
              {settings?.last_auto_sync_at && (
                <p className="mt-1 text-xs text-gray-400">
                  Last auto-sync: {new Date(settings.last_auto_sync_at).toLocaleString()}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Email Notifications */}
      <div className="rounded-lg bg-white p-6 shadow">
        <div className="flex items-center gap-3 mb-4">
          <Bell className="h-6 w-6 text-blue-600" />
          <h2 className="text-lg font-semibold text-gray-900">Email Notifications</h2>
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
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
            </div>
            <div className="ml-3">
              <label htmlFor="email_notifications_enabled" className="font-medium text-gray-700">
                Send email notifications
              </label>
              <p className="text-sm text-gray-500">
                Get notified when new invoices are detected
              </p>
            </div>
          </div>

          {formData.email_notifications_enabled && (
            <div>
              <label htmlFor="notification_email" className="block text-sm font-medium text-gray-700">
                Notification email address
              </label>
              <input
                type="email"
                id="notification_email"
                value={formData.notification_email}
                onChange={(e) => setFormData({ ...formData, notification_email: e.target.value })}
                placeholder={userEmail}
                className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-blue-500 focus:outline-none focus:ring-blue-500"
              />
              <p className="mt-1 text-sm text-gray-500">
                Leave blank to use your account email ({userEmail})
              </p>
            </div>
          )}

          {formData.email_notifications_enabled && (
            <div>
              <Button
                onClick={handleSendTestEmail}
                disabled={isSendingTest}
                variant="outline"
                className="w-full sm:w-auto"
              >
                <Mail className="mr-2 h-4 w-4" />
                {isSendingTest ? 'Sending...' : 'Send Test Email'}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg border border-blue-200 bg-blue-50 p-4">
        <h3 className="text-sm font-medium text-blue-900">About Automatic Sync</h3>
        <p className="mt-1 text-sm text-blue-700">
          Automatic sync requires setting up a cron job to call{' '}
          <code className="rounded bg-blue-100 px-1 py-0.5 text-xs">/api/cron/sync</code> hourly.
          See documentation for setup instructions.
        </p>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="px-8">
          {isSaving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  )
}
