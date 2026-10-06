import { NextResponse } from 'next/server'
import { clearLoginSession } from '@/lib/auth'

export async function POST() {
  return clearLoginSession(NextResponse.json({ success: true }))
}
