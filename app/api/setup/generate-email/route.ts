import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { nanoid } from 'nanoid'

export async function POST(request: Request) {
    try {
        const user = await requireApiUser()
        if (!user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const supabase = await createClient()

        // Check if user already has an inbound email
        const { data: settings } = await supabase
            .from('user_settings')
            .select('inbound_email')
            .eq('user_id', user.id)
            .single()

        if (settings?.inbound_email) {
            return NextResponse.json({ email: settings.inbound_email })
        }

        // Generate a unique slug
        // Try to use part of the user's email first, plus some random chars for uniqueness
        // e.g. roberto-4k2m@...
        const emailPrefix = user.email?.split('@')[0].replace(/[^a-z0-9]/gi, '').toLowerCase() || 'user'
        const randomSuffix = nanoid(6).toLowerCase()
        const slug = `${emailPrefix}-${randomSuffix}`
        const inboundEmail = `${slug}@entuaava.resend.app`

        // Save to database
        // Note: This relies on the new column 'inbound_email' existing (from migration)
        const { data: updatedSettings, error } = await supabase
            .from('user_settings')
            .update({ inbound_email: inboundEmail })
            .eq('user_id', user.id)
            .select('inbound_email')
            .single()

        if (error) {
            console.error('Failed to save inbound email:', error)
            // Check for unique constraint violation and retry if needed (unlikely with nanoid)
            return NextResponse.json({ error: 'Failed to generate email' }, { status: 500 })
        }

        return NextResponse.json({ email: updatedSettings.inbound_email })
    } catch (error) {
        console.error('Error generating email:', error)
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
    }
}
