import Link from 'next/link'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

export default function SignupPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center space-y-2">
          <CardTitle className="text-2xl font-bold tracking-tight">Registo desativado</CardTitle>
          <CardDescription>
            Esta aplicação está bloqueada para utilização por um único utilizador.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Para manter a app privada, novas contas não podem ser criadas a partir da interface.
          </p>
          <p>
            O acesso é gerido internamente e apenas o utilizador existente pode entrar.
          </p>
        </CardContent>

        <CardFooter className="justify-center">
          <Link href="/login">
            <Button>Voltar ao login</Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  )
}
