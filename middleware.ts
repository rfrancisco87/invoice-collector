import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { getAllowedOwnerEmail, isAllowedOwnerEmail } from '@/lib/auth-config'

/**
 * Add security headers to response
 */
function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY')

  // Prevent MIME type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff')

  // Enable XSS protection (legacy browsers)
  response.headers.set('X-XSS-Protection', '1; mode=block')

  // Control referrer information
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')

  // Permissions policy (disable unnecessary features)
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), interest-cohort=()'
  )

  // Content Security Policy
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

function clearSupabaseCookies(request: NextRequest, response: NextResponse) {
  request.cookies.getAll().forEach(({ name }) => {
    if (name.startsWith('sb-')) {
      response.cookies.set(name, '', {
        expires: new Date(0),
        maxAge: 0,
        path: '/',
      })
    }
  })

  return response
}

function unauthorizedResponse(request: NextRequest, pathname: string) {
  if (pathname.startsWith('/api')) {
    const response = NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    )
    return addSecurityHeaders(clearSupabaseCookies(request, response))
  }

  const redirectUrl = new URL('/login', request.url)
  redirectUrl.searchParams.set('error', 'unauthorized_user')

  const response = NextResponse.redirect(redirectUrl)
  return addSecurityHeaders(clearSupabaseCookies(request, response))
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname
  const allowedOwnerEmail = getAllowedOwnerEmail()

  // Skip middleware for callbacks to avoid interfering with OAuth flows
  if (pathname === '/auth/callback' || pathname === '/api/gmail/callback') {
    const response = NextResponse.next()
    return addSecurityHeaders(response)
  }

  let supabaseResponse = NextResponse.next({
    request,
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options: any }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Refresh session if expired
  const { data: { user } } = await supabase.auth.getUser()

  // Route definitions
  const publicRoutes = ['/login', '/signup', '/forgot-password', '/reset-password']
  const protectedRoutes = ['/dashboard', '/setup', '/settings', '/approved', '/gmail-connect']
  const adminRoutes = ['/admin']
  const publicApiRoutes = ['/api/inbound-email', '/api/cron/sync', '/api/auth/google', '/api/auth/logout']

  const isPublicRoute = publicRoutes.includes(pathname)
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))
  const isAdminRoute = adminRoutes.some(route => pathname.startsWith(route))
  const isApiRoute = pathname.startsWith('/api')
  const isProtectedApiRoute = isApiRoute && !publicApiRoutes.some(route => pathname.startsWith(route))

  if (allowedOwnerEmail && user && !isAllowedOwnerEmail(user.email)) {
    return unauthorizedResponse(request, pathname)
  }

  // Redirect unauthenticated users from protected routes
  if ((isProtectedRoute || isAdminRoute) && !user) {
    const redirectUrl = new URL('/login', request.url)
    redirectUrl.searchParams.set('redirect', pathname)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    return addSecurityHeaders(redirectResponse)
  }

  if (isProtectedApiRoute && !user) {
    const response = NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    return addSecurityHeaders(response)
  }

  // Redirect authenticated users away from public auth pages
  if (isPublicRoute && user) {
    const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
    return addSecurityHeaders(redirectResponse)
  }

  // Check admin access for admin routes
  if (isAdminRoute && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (!profile || profile.role !== 'admin') {
      const redirectResponse = NextResponse.redirect(new URL('/dashboard', request.url))
      return addSecurityHeaders(redirectResponse)
    }
  }

  return addSecurityHeaders(supabaseResponse)
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
