import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// This module holds the service-role key, which bypasses every RLS policy.
// Importing it from a client component would bundle that key into JavaScript
// served to the browser, so fail loudly instead of shipping it.
if (typeof window !== 'undefined') {
  throw new Error(
    'lib/supabase/admin is server-only: it carries the service-role key. ' +
      'Use lib/supabase/client in client components.'
  )
}

export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase admin environment variables')
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })
}
