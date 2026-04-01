import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Password reset moved</CardTitle>
          <CardDescription>
            Passwords are now updated directly in the database-backed app auth system.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>Password reset is not exposed through this interface.</p>
          <p>Manage credentials through your internal admin setup instead.</p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/login">
            <Button>Back to login</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
