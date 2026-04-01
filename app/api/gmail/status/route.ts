import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { getValidAccessToken } from '@/lib/token-refresh'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
    try {
        const user = await requireApiUser()

        if (!user) {
            return NextResponse.json({ connected: false }, { status: 401 })
        }

        const supabase = await createClient()

        const { data: account } = await supabase
            .from('gmail_accounts')
            .select('*')
            .eq('user_id', user.id)
            .single()

        if (!account) {
            return NextResponse.json({ connected: false, hasGmail: false })
        }

        // We have an account, let's verify if we have Gmail access
        // We'll try to get the Gmail Profile. If it fails with insufficient permissions, we know we lack scope.
        try {
            const tokenResult = await getValidAccessToken(
                account.access_token,
                account.refresh_token,
                account.token_expiry
            )

            const auth = new google.auth.OAuth2()
            auth.setCredentials({ access_token: tokenResult.accessToken })

            const gmail = google.gmail({ version: 'v1', auth })
            await gmail.users.getProfile({ userId: 'me' })

            // If valid, assume we have tokens updated too
            if (tokenResult.needsUpdate && tokenResult.newExpiry) {
                await supabase
                    .from('gmail_accounts')
                    .update({
                        access_token: tokenResult.accessToken,
                        token_expiry: tokenResult.newExpiry,
                    })
                    .eq('id', account.id)
            }

            return NextResponse.json({ connected: true, hasGmail: true, email: account.email })

        } catch (e: any) {
            // Check if error is due to scope
            const isScopeError = e.message?.includes('Insufficient Permission') || e.code === 403

            if (isScopeError) {
                return NextResponse.json({ connected: true, hasGmail: false, email: account.email })
            }

            // If other error (e.g. invalid grant), might be disconnected
            console.error('Gmail status check error', e)
            return NextResponse.json({ connected: true, hasGmail: false, email: account.email, error: e.message })
        }

    } catch (error) {
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
