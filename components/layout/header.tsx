import Link from 'next/link'
import { SyncButton } from '@/components/sync-button'
import { UserMenu } from '@/components/layout/user-menu'
import { ThemeToggle } from '@/components/theme-toggle'
import { FileText } from 'lucide-react'

interface HeaderProps {
  user: {
    id: string
    email?: string | null
    user_metadata?: {
      full_name?: string
      avatar_url?: string
    }
  }
  showSync?: boolean
  isAdmin?: boolean
}

export function Header({ user, showSync = true, isAdmin = false }: HeaderProps) {
  return (
    <header className="border-b bg-background">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <FileText className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-lg font-semibold text-foreground">
              Invoice Collector
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {showSync && <SyncButton />}
            <ThemeToggle />
            <UserMenu user={user} isAdmin={isAdmin} />
          </div>
        </div>
      </div>
    </header>
  )
}
