'use client'

import { HelpCircle } from 'lucide-react'

export function HelpButton() {
    return (
        <button
            onClick={() => (window as any).restartOnboarding?.()}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-accent transition-colors"
            aria-label="Reiniciar tutorial"
        >
            <HelpCircle className="h-4 w-4" />
        </button>
    )
}
