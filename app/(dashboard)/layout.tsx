import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Header } from '@/components/layout/header'
import { InternalNav } from '@/components/layout/internal-nav'
import { GmailBanner } from '@/components/gmail-banner'
import { OnboardingProvider } from '@/components/onboarding-provider'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  // Check if Gmail is connected
  const { data: gmailAccount } = await supabase
    .from('gmail_accounts')
    .select('email')
    .eq('user_id', user.id)
    .single()

  // Check if user is admin and onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('role, onboarding_completed')
    .eq('id', user.id)
    .single()

  const isAdmin = profile?.role === 'admin'
  const isGmailConnected = !!gmailAccount
  const showOnboarding = !profile?.onboarding_completed

  return (
    <OnboardingProvider showOnboarding={showOnboarding}>
      <div className="min-h-screen bg-background">
        <Header user={user} showSync={isGmailConnected} isAdmin={isAdmin} />
        <GmailBanner isConnected={isGmailConnected} email={gmailAccount?.email} />
        <InternalNav />
        <main>{children}</main>
      </div>
    </OnboardingProvider>
  )
}
