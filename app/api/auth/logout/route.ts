import { NextResponse } from 'next/server'
import { clearLoginSession } from '@/lib/auth'

export async function POST() {
  return clearLoginSession(NextResponse.json({ success: true }))
}

export async function GET(request: Request) {
  return clearLoginSession(NextResponse.redirect(new URL('/login', request.url)))
}
