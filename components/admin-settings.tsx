'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'

interface AdminSettingsProps {
  initialWebhookUrl: string
}

export function AdminSettings({ initialWebhookUrl }: AdminSettingsProps) {
  const [webhookUrl, setWebhookUrl] = useState(initialWebhookUrl)
  const [isSaving, setIsSaving] = useState(false)
  const [isTesting, setIsTesting] = useState(false)
  const [message, setMessage] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)
  const [testResult, setTestResult] = useState<{
    type: 'success' | 'error'
    text: string
  } | null>(null)

  const handleSave = async () => {
    try {
      setIsSaving(true)
      setMessage(null)

      const response = await fetch('/api/admin/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhook_url: webhookUrl }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to save settings')
      }

      setMessage({
        type: 'success',
        text: 'Webhook URL saved successfully!',
      })
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to save settings',
      })
    } finally {
      setIsSaving(false)
    }
  }

  const handleTest = async () => {
    try {
      setIsTesting(true)
      setTestResult(null)

      const response = await fetch('/api/admin/test-webhook', {
        method: 'POST',
      })

      const data = await response.json()

      if (data.success) {
        setTestResult({
          type: 'success',
          text: data.message,
        })
      } else {
        setTestResult({
          type: 'error',
          text: data.error || 'Webhook test failed',
        })
      }
    } catch (error) {
      setTestResult({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to test webhook',
      })
    } finally {
      setIsTesting(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Webhook Configuration */}
      <div className="rounded-lg bg-white p-6 shadow">
        <h2 className="text-xl font-semibold text-gray-900">
          Invoice Processing Webhook
        </h2>
        <p className="mt-1 text-sm text-gray-600">
          Configure the external n8n webhook URL for automated invoice data extraction.
        </p>

        <div className="mt-6">
          <label htmlFor="webhook-url" className="block text-sm font-medium text-gray-700">
            Webhook URL
          </label>
          <div className="mt-2">
            <input
              type="url"
              id="webhook-url"
              value={webhookUrl}
              onChange={(e) => setWebhookUrl(e.target.value)}
              placeholder="https://n8n.rfrancisco.io/webhook/invoice-processor"
              className="block w-full rounded-md border border-gray-300 px-3 py-2 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <p className="mt-2 text-sm text-gray-500">
            PDFs will be sent to this endpoint for processing during sync.
          </p>
        </div>

        {/* Action Buttons */}
        <div className="mt-6 flex gap-3">
          <Button onClick={handleSave} disabled={isSaving} variant="default" size="lg">
            {isSaving ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              'Save Webhook URL'
            )}
          </Button>

          <Button
            onClick={handleTest}
            disabled={isTesting || !webhookUrl.trim()}
            variant="outline"
            size="lg"
          >
            {isTesting ? (
              <>
                <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-gray-600 border-t-transparent" />
                Testing...
              </>
            ) : (
              'Test Webhook'
            )}
          </Button>
        </div>

        {/* Save Message */}
        {message && (
          <div
            className={`mt-4 rounded-md p-4 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            <p className="text-sm font-medium">{message.text}</p>
          </div>
        )}

        {/* Test Result */}
        {testResult && (
          <div
            className={`mt-4 rounded-md p-4 ${
              testResult.type === 'success'
                ? 'bg-green-50 text-green-800'
                : 'bg-red-50 text-red-800'
            }`}
          >
            <div className="flex items-center">
              {testResult.type === 'success' ? (
                <svg
                  className="h-5 w-5 text-green-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                    clipRule="evenodd"
                  />
                </svg>
              ) : (
                <svg
                  className="h-5 w-5 text-red-400"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              <p className="ml-3 text-sm font-medium">{testResult.text}</p>
            </div>
          </div>
        )}
      </div>

      {/* Information Box */}
      <div className="rounded-lg bg-blue-50 p-6">
        <div className="flex">
          <div className="flex-shrink-0">
            <svg
              className="h-5 w-5 text-blue-400"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-3">
            <h3 className="text-sm font-medium text-blue-800">
              How Webhook Processing Works
            </h3>
            <div className="mt-2 text-sm text-blue-700">
              <ul className="list-inside list-disc space-y-1">
                <li>When sync finds a new document, the PDF is sent to the webhook</li>
                <li>The webhook extracts invoice data (number, date, supplier, totals, etc.)</li>
                <li>Extracted data is automatically saved to the database</li>
                <li>If webhook fails, document is still saved with an error flag</li>
                <li>Empty webhook URL disables automated processing</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
