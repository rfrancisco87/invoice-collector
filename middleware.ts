import { NextResponse, type NextRequest } from 'next/server'
import { clearLoginSession, getUserFromRequest } from '@/lib/auth'

function addSecurityHeaders(response: NextResponse) {
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )
  response.headers.set(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: https:; " +
    "font-src 'self' data:; " +
    "connect-src 'self' https://*.supabase.co https://*.googleapis.com; " +
    "frame-ancestors 'none';"
  )

  return response
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const redirectUrl = new URL('/login', request.url)

  if (pathname !== '/') {
    redirectUrl.searchParams.set('redirect', pathname)
  }

  const response = NextResponse.redirect(redirectUrl)
  return addSecurityHeaders(response)
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname

  if (pathname.startsWith('/_next') || pathname === '/favicon.ico') {
    return NextResponse.next()
  }

  const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password']
  const publicApiRoutes = ['/api/auth/login', '/api/auth/logout']
  const isPublicRoute = publicRoutes.includes(pathname)
  const isPublicApiRoute = publicApiRoutes.includes(pathname)
  const isApiRoute = pathname.startsWith('/api')
  const isProtectedApiRoute =
    isApiRoute &&
    !isPublicApiRoute &&
    !pathname.startsWith('/api/inbound-email') &&
    !pathname.startsWith('/api/cron/sync')

  const user = await getUserFromRequest(request)

  if (isPublicRoute && user) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  if (!user && !isPublicRoute && !isPublicApiRoute) {
    if (isProtectedApiRoute) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }

    return redirectToLogin(request, pathname)
  }

  if (!user && request.cookies.get('invoice_collector_session')) {
    const response = isProtectedApiRoute
      ? NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      : redirectToLogin(request, pathname)
    return addSecurityHeaders(clearLoginSession(response))
  }

  return addSecurityHeaders(NextResponse.next())
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
