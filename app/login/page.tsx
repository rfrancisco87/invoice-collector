'use client'

import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { useEffect, useState, Suspense } from 'react'

function LoginContent() {
  const searchParams = useSearchParams()
  const error = searchParams.get('error')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (error) {
      const errorMessages: Record<string, string> = {
        oauth_failed: 'Failed to authenticate with Google. Please try again.',
        auth_failed: 'Authentication failed. Please try again.',
        no_code: 'No authentication code received. Please try again.',
      }

      const message = errorMessages[error] || 'An error occurred. Please try again.'
      alert(message)
    }
  }, [error])

  const handleGoogleSignIn = () => {
    setIsLoading(true)
    window.location.href = '/api/auth/google'
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Invoice Collector
          </h1>
          <p className="mt-2 text-sm text-gray-600">
            Automated invoice collection and management
          </p>
        </div>

        <div className="mt-8 space-y-6">
          <div className="space-y-4">
            <Button
              onClick={handleGoogleSignIn}
              disabled={isLoading}
              className="w-full flex items-center justify-center gap-3"
              size="lg"
            >
              {isLoading ? (
                <>
                  <svg
                    className="animate-spin h-5 w-5 text-white"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  Signing in...
                </>
              ) : (
                <>
                  <svg className="h-5 w-5" viewBox="0 0 24 24">
                    <path
                      fill="currentColor"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="currentColor"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                    />
                    <path
                      fill="currentColor"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                    />
                  </svg>
                  Sign in with Google
                </>
              )}
            </Button>
          </div>

          <div className="text-center text-xs text-gray-500">
            <p>
              By signing in, you grant access to:
            </p>
            <ul className="mt-2 space-y-1 text-left">
              <li>• Read your Gmail messages (readonly)</li>
              <li>• Create and manage files in Google Drive</li>
              <li>• Your email and profile information</li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-6 text-center text-xs text-gray-500">
          <p>
            Invoice Collector helps Portuguese businesses automatically collect
            and organize invoices from email.
          </p>
        </div>
      </div>
    </div>
  )
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-lg">
          <div className="text-center">
            <h1 className="text-3xl font-bold tracking-tight text-gray-900">
              Invoice Collector
            </h1>
            <p className="mt-2 text-sm text-gray-600">
              Loading...
            </p>
          </div>
        </div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  )
}
