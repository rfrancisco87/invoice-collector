import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Password managed locally</CardTitle>
          <CardDescription>
            This app no longer uses email-based password reset.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Password recovery is not available from the public interface.
          </p>
          <p>
            Use the existing admin access and your internal setup flow to manage credentials.
          </p>
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
