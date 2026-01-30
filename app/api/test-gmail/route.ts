import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGmailClient } from '@/lib/gmail'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { session } } = await supabase.auth.getSession()

    if (!session || !session.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const providerToken = session.provider_token

    if (!providerToken) {
      return NextResponse.json({
        error: 'No provider token',
        scopes: session.provider_refresh_token ? 'Has refresh token' : 'No refresh token',
      }, { status: 401 })
    }

    const gmail = await getGmailClient(providerToken)

    // Test 1: Get user profile
    const profile = await gmail.users.getProfile({ userId: 'me' })

    // Test 2: List recent messages
    const messages = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 5,
    })

    // Test 3: Check if we can get a message with attachments
    let attachmentTest = null
    if (messages.data.messages && messages.data.messages.length > 0) {
      const firstMsg = await gmail.users.messages.get({
        userId: 'me',
        id: messages.data.messages[0].id!,
        format: 'full',
      })
      attachmentTest = {
        hasPayload: !!firstMsg.data.payload,
        hasParts: !!firstMsg.data.payload?.parts,
        partsCount: firstMsg.data.payload?.parts?.length || 0,
      }
    }

    return NextResponse.json({
      success: true,
      profile: {
        emailAddress: profile.data.emailAddress,
        messagesTotal: profile.data.messagesTotal,
        threadsTotal: profile.data.threadsTotal,
      },
      recentMessages: {
        count: messages.data.messages?.length || 0,
        resultSizeEstimate: messages.data.resultSizeEstimate,
      },
      attachmentTest,
      scopes: 'Gmail API access working',
    })
  } catch (error) {
    console.error('Gmail test error:', error)
    return NextResponse.json(
      {
        error: 'Gmail API test failed',
        details: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 }
    )
  }
}
