'use client'

import { useState, useEffect } from 'react'
import { OnboardingWizard } from './onboarding-wizard'

interface OnboardingProviderProps {
    children: React.ReactNode
    showOnboarding: boolean
}

export function OnboardingProvider({ children, showOnboarding: initialShowOnboarding }: OnboardingProviderProps) {
    const [showWizard, setShowWizard] = useState(initialShowOnboarding)

    // Expose function to restart wizard (will be used by help icon)
    useEffect(() => {
        // Make restart function available globally
        (window as any).restartOnboarding = () => {
            setShowWizard(true)
        }

        return () => {
            delete (window as any).restartOnboarding
        }
    }, [])

    const handleClose = () => {
        setShowWizard(false)
    }

    return (
        <>
            {children}
            <OnboardingWizard open={showWizard} onClose={handleClose} />
        </>
    )
}
