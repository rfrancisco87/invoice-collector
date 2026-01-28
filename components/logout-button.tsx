'use client'

import { Button } from '@/components/ui/button'
import { useState } from 'react'

export function LogoutButton() {
  const [isLoading, setIsLoading] = useState(false)

  const handleLogout = async () => {
    setIsLoading(true)
    window.location.href = '/api/auth/logout'
  }

  return (
    <Button
      onClick={handleLogout}
      disabled={isLoading}
      variant="outline"
      size="sm"
    >
      {isLoading ? 'Signing out...' : 'Sign Out'}
    </Button>
  )
}
