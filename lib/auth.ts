import { redirect } from 'next/navigation'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { isAllowedOwnerEmail } from '@/lib/auth-config'

export async function getAuthenticatedOwner() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return {
    supabase,
    user,
    isAllowed: isAllowedOwnerEmail(user?.email),
  }
}

export async function requireAuthenticatedOwner(redirectTo = '/login'): Promise<{
  supabase: Awaited<ReturnType<typeof createClient>>
  user: User
}> {
  const { supabase, user, isAllowed } = await getAuthenticatedOwner()

  if (!user || !isAllowed) {
    redirect(redirectTo)
  }

  return { supabase, user }
}
