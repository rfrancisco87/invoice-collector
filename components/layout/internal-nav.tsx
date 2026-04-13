'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

interface NavItem {
  href: string
  label: string
}

const navItems: NavItem[] = [
  { href: '/dashboard', label: 'Pendentes' },
  { href: '/approved', label: 'Aprovadas' },
  { href: '/rejected', label: 'Rejeitadas' },
]

export function InternalNav() {
  const pathname = usePathname()

  return (
    <div className="border-b bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <nav className="-mb-px flex space-x-8" aria-label="Navegação">
          {navItems.map((item) => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'whitespace-nowrap border-b-2 py-4 px-1 text-sm font-medium transition-colors',
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
                )}
                aria-current={isActive ? 'page' : undefined}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
      </div>
    </div>
  )
}
