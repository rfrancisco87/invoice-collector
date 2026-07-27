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
  // Account-creation and recovery endpoints are reachable without a session by
  // definition. Each authenticates on its own terms: signup requires a valid
  // invite code, reset-password requires an unexpired single-use token, and
  // forgot-password returns an identical response for every input so it cannot
  // be used to enumerate accounts.
  const publicApiRoutes = [
    '/api/auth/login',
    '/api/auth/logout',
    '/api/auth/signup',
    '/api/auth/forgot-password',
    '/api/auth/reset-password',
  ]
  const isPublicRoute = publicRoutes.includes(pathname)
  const isPublicApiRoute = publicApiRoutes.includes(pathname)
  const isApiRoute = pathname.startsWith('/api')
  // Routes that handle their own authentication (Bearer token, API key, etc.)
  const isSelfAuthApiRoute =
    pathname.startsWith('/api/inbound-email') ||
    pathname.startsWith('/api/cron/sync')
  const isProtectedApiRoute = isApiRoute && !isPublicApiRoute && !isSelfAuthApiRoute

  const user = await getUserFromRequest(request)

  if (isPublicRoute && user) {
    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)))
  }

  if (!user && !isPublicRoute && !isPublicApiRoute && !isSelfAuthApiRoute) {
    if (isProtectedApiRoute) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
      )
    }

    return redirectToLogin(request, pathname)
  }

  // Admin surfaces. The /admin layout and page already re-check the role
  // server-side; gating here too means a new admin route is protected the
  // moment it exists, rather than the moment someone remembers to add the
  // check. Signed-in non-admins are bounced to their dashboard so the
  // existence of the panel isn't advertised.
  const isAdminRoute = pathname.startsWith('/admin') || pathname.startsWith('/api/admin')

  if (isAdminRoute && user && user.role !== 'admin') {
    if (isApiRoute) {
      return addSecurityHeaders(
        NextResponse.json({ error: 'Forbidden' }, { status: 403 })
      )
    }

    return addSecurityHeaders(NextResponse.redirect(new URL('/dashboard', request.url)))
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
