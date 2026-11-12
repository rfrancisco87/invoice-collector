import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { getValidGmailAccessToken } from '@/lib/gmail-tokens'
import { getGmailClient } from '@/lib/gmail'
import { listSendAsAddresses } from '@/lib/gmail-send'

export const dynamic = 'force-dynamic'

/**
 * Addresses the connected Gmail account can send as (primary + verified
 * aliases). Feeds the sender picker for emailing approved documents.
 */
export async function GET() {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = await createClient()
    const { data: account } = await supabase
      .from('gmail_accounts')
      .select('id, user_id, access_token, refresh_token, token_expiry')
      .eq('user_id', user.id)
      .maybeSingle()

    if (!account) {
      return NextResponse.json({ addresses: [], error: 'Gmail account not connected' }, { status: 404 })
    }

    const gmail = await getGmailClient(await getValidGmailAccessToken(supabase, account))
    const addresses = await listSendAsAddresses(gmail)
    return NextResponse.json({ addresses })
  } catch (error: any) {
    const status = error?.code ?? error?.response?.status
    console.error('[Gmail send-as] Failed:', error?.message || error)
    return NextResponse.json(
      { addresses: [], error: 'Failed to list send-as addresses' },
      { status: status === 403 ? 403 : 500 }
    )
  }
}
