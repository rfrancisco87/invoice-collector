import { redirect } from 'next/navigation'
import { getAuthenticatedOwner } from '@/lib/auth'

export default async function Home() {
  const { user, isAllowed } = await getAuthenticatedOwner()

  if (user && isAllowed) {
    redirect('/dashboard')
  } else {
    redirect('/login')
  }
}
