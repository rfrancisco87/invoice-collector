'use client'

import { useEffect, useState, useCallback, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { StepSources, StepMasterFolder, StepEducation, StepConnect } from '@/components/setup/WizardSteps'
import { AlertCircle } from 'lucide-react'

// Define steps
// Flow: Sources -> Connect (if needed) -> Master Folder -> Education/Seeding
const STEPS = ['sources', 'connect', 'master_folder', 'education']

function SetupWizard() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [currentStep, setCurrentStep] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Data State
  const [inboundEmail, setInboundEmail] = useState<string | null>(null)
  const [gmailConnected, setGmailConnected] = useState(false)
  const [hasGmailScope, setHasGmailScope] = useState(false)
  const [sources, setSources] = useState({
    gmail: true,
    forwarding: false,
    drive_inbox: false,
    upload: true
  })

  // Load initial data
  useEffect(() => {
    checkExistingSettings()
    checkGmailConnection()

    // Check if we just came back from Gmail Connect
    if (searchParams.get('gmail') === 'connected') {
      setGmailConnected(true)
      // Advance to Master Folder step if we were connecting
      // We assume step 1 (connect) -> 2 (master folder)
      setCurrentStep(2)
    }
  }, [searchParams])

  const checkGmailConnection = async () => {
    try {
      const res = await fetch('/api/gmail/status')
      if (res.ok) {
        const data = await res.json()
        setGmailConnected(data.connected)
        setHasGmailScope(data.hasGmail)
      }
    } catch (e) {
      console.error('Failed to check connection', e)
    }
  }

  const checkExistingSettings = async () => {
    const response = await fetch('/api/settings')
    if (!response.ok) return
    const data = await response.json()
    const settings = data.settings

    if (settings) {
      if (settings.inbound_email) setInboundEmail(settings.inbound_email)
      // Parse enabled sources
      if (settings.enabled_sources && Array.isArray(settings.enabled_sources)) {
        setSources({
          gmail: settings.enabled_sources.includes('gmail'),
          forwarding: settings.enabled_sources.includes('forwarding'),
          drive_inbox: settings.enabled_sources.includes('drive_inbox'),
          upload: true
        })
      }
    }
  }

  // Actions
  const handleNext = async () => {
    if (currentStep < STEPS.length - 1) {
      setCurrentStep(prev => prev + 1)
    }
  }

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1)
    }
  }

  const saveFolderSelection = async (id: string, name: string, path?: string) => {
    setIsLoading(true)
    try {
      const response = await fetch('/api/drive/folders/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folderId: id,
          folderName: name,
          folderPath: path,
          createInbox: sources.drive_inbox // Pass true if inbox needed
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to configure folders')
      }

      // Move to next step (Education)
      handleNext()
    } catch (e: any) {
      setError(e.message || 'Failed to configure Master Folder structure')
    } finally {
      setIsLoading(false)
    }
  }

  const generateEmail = useCallback(async () => {
    try {
      const response = await fetch('/api/setup/generate-email', { method: 'POST' })
      const data = await response.json()
      if (data.email) setInboundEmail(data.email)
    } catch (e) {
      console.error('Failed to generate email', e)
    }
  }, [])

  const toggleSource = (key: string) => {
    setSources(prev => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))
  }

  const handleFinish = async () => {
    setIsLoading(true)

    try {
      // 1. Save sources
      const enabledSourcesList = Object.keys(sources).filter(k => sources[k as keyof typeof sources])

      const settingsResponse = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled_sources: enabledSourcesList,
          onboarding_completed: true
        }),
      })

      if (!settingsResponse.ok) {
        const data = await settingsResponse.json().catch(() => null)
        throw new Error(data?.error || 'Failed to save settings')
      }

      await fetch('/api/onboarding/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'complete' }),
      })

      // 2. Seed Demo Data
      try {
        await fetch('/api/setup/seed', { method: 'POST' })
      } catch (seedErr) {
        console.warn('Seeding failed', seedErr)
      }

      router.push('/dashboard')
    } catch (e: any) {
      setError('Failed to save settings: ' + (e.message || e))
      setIsLoading(false)
    }
  }

  return (
    <div className="w-full max-w-2xl space-y-8">

      {/* Progress Indicator */}
      <div className="flex justify-center space-x-2">
        {STEPS.map((step, idx) => (
          <div key={step} className={`h-2 w-16 rounded-full transition-colors ${idx <= currentStep ? 'bg-primary' : 'bg-muted'}`} />
        ))}
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}

      <div className="transition-all duration-300 ease-in-out">
        {currentStep === 0 && (
          <StepSources
            sources={sources}
            toggleSource={toggleSource}
            onNext={handleNext}
            loading={isLoading}
          />
        )}

        {currentStep === 1 && (
          <StepConnect
            isConnected={gmailConnected}
            onNext={handleNext}
            onPrev={handlePrev}
            loading={isLoading}
            sources={sources}
            hasGmailScope={hasGmailScope}
          />
        )}

        {currentStep === 2 && (
          <StepMasterFolder
            loading={isLoading}
            onNext={handleNext}
            onPrev={handlePrev}
            saveFolder={saveFolderSelection}
          />
        )}

        {currentStep === 3 && (
          <StepEducation
            sources={sources}
            inboundEmail={inboundEmail}
            generateEmail={generateEmail}
            onFinish={handleFinish}
            loading={isLoading}
          />
        )}
      </div>
    </div>
  )
}

export default function SetupPage() {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <Suspense fallback={<div>Loading...</div>}>
        <SetupWizard />
      </Suspense>
    </div>
  )
}
