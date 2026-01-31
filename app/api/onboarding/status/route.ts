import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options)
                        })
                    },
                },
            }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        // Get onboarding status from profile
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('onboarding_completed, onboarding_step, demo_invoice_created')
            .eq('id', user.id)
            .single()

        if (profileError) {
            console.error('Error fetching profile:', profileError)
            return NextResponse.json({ error: 'Failed to fetch onboarding status' }, { status: 500 })
        }

        return NextResponse.json({
            onboarding_completed: profile?.onboarding_completed ?? false,
            onboarding_step: profile?.onboarding_step ?? 0,
            demo_invoice_created: profile?.demo_invoice_created ?? false
        })
    } catch (error) {
        console.error('Error in onboarding status:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}

export async function POST(request: Request) {
    try {
        const cookieStore = await cookies()
        const supabase = createServerClient(
            process.env.NEXT_PUBLIC_SUPABASE_URL!,
            process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
            {
                cookies: {
                    getAll() {
                        return cookieStore.getAll()
                    },
                    setAll(cookiesToSet) {
                        cookiesToSet.forEach(({ name, value, options }) => {
                            cookieStore.set(name, value, options)
                        })
                    },
                },
            }
        )

        const { data: { user }, error: authError } = await supabase.auth.getUser()

        if (authError || !user) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
        }

        const body = await request.json()
        const { action, step } = body

        if (action === 'complete') {
            // Mark onboarding as completed
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    onboarding_completed: true,
                    onboarding_step: 4,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)

            if (updateError) {
                console.error('Error completing onboarding:', updateError)
                return NextResponse.json({ error: 'Failed to complete onboarding' }, { status: 500 })
            }

            return NextResponse.json({ success: true })
        } else if (action === 'update_step' && typeof step === 'number') {
            // Update current step
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    onboarding_step: step,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)

            if (updateError) {
                console.error('Error updating onboarding step:', updateError)
                return NextResponse.json({ error: 'Failed to update step' }, { status: 500 })
            }

            return NextResponse.json({ success: true })
        } else if (action === 'restart') {
            // Restart onboarding
            const { error: updateError } = await supabase
                .from('profiles')
                .update({
                    onboarding_completed: false,
                    onboarding_step: 0,
                    updated_at: new Date().toISOString()
                })
                .eq('id', user.id)

            if (updateError) {
                console.error('Error restarting onboarding:', updateError)
                return NextResponse.json({ error: 'Failed to restart onboarding' }, { status: 500 })
            }

            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    } catch (error) {
        console.error('Error in onboarding update:', error)
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
    }
}
