import type { Metadata } from 'next'
import { headers } from 'next/headers'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import { ThemeProvider } from '@/components/providers/theme-provider'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Invoice Collector',
  description: 'Recolha e gestão automatizada de faturas para empresas portuguesas',
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Per-request CSP nonce from middleware. Reading headers() makes every page
  // render dynamically, which a nonce requires: a prerendered page would ship
  // scripts without it and the browser would block them.
  const nonce = (await headers()).get('x-nonce') ?? undefined

  return (
    <html lang="pt" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
          nonce={nonce}
        >
          {children}
          <Toaster position="top-right" />
        </ThemeProvider>
      </body>
    </html>
  )
}
