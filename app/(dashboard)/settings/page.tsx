import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { SettingsForm } from '@/components/settings-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: settings } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', user.id)
    .single()

  // Get Gmail account info
  const { data: gmailAccount } = await supabase
    .from('gmail_accounts')
    .select('email')
    .eq('user_id', user.id)
    .single()

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <Card>
        <CardHeader>
          <CardTitle>Definições</CardTitle>
          <CardDescription>
            Configure as suas preferências de sincronização e notificações
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SettingsForm
            settings={settings}
            userEmail={user.email || ''}
            gmailEmail={gmailAccount?.email}
          />
        </CardContent>
      </Card>
    </div>
  )
}
