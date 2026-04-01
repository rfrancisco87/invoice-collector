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
            To change the login password, run the local script:
          </p>
          <code className="block rounded bg-muted px-3 py-2">
            npm run set-password -- you@example.com new-password &quot;Your Name&quot;
          </code>
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
