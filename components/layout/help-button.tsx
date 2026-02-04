'use client'

import Link from 'next/link'
import { HelpCircle } from 'lucide-react'

export function HelpButton() {
    return (
        <Link
            href="/setup"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border bg-background hover:bg-accent transition-colors"
            aria-label="Reiniciar tutorial"
        >
            <HelpCircle className="h-4 w-4" />
        </Link>
    )
}
