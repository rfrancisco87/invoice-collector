import { NextResponse } from 'next/server'
import { requireApiUser } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { google } from 'googleapis'
import { decryptToken } from '@/lib/gmail-tokens'

/**
 * Gmail Disconnect
 *
 * Removes Gmail connection for the authenticated user.
 * Revokes Google tokens and deletes gmail_account entry.
 */
export async function POST() {
  try {
    const user = await requireApiUser()
    if (!user) {
      return NextResponse.json(
        { error: 'Não autorizado' },
        { status: 401 }
      )
    }

    const supabase = await createClient()

    // Get current gmail account to revoke tokens
    const { data: gmailAccount } = await supabase
      .from('gmail_accounts')
      .select('access_token, refresh_token')
      .eq('user_id', user.id)
      .single()

    // Try to revoke tokens with Google (non-blocking). Prefer the refresh
    // token: revoking it kills the whole grant, whereas a revoked access token
    // is usually already expired anyway. Stored values are encrypted, so they
    // must be decrypted first or Google just rejects the ciphertext.
    if (gmailAccount) {
      try {
        const token =
          decryptToken(gmailAccount.refresh_token) ?? decryptToken(gmailAccount.access_token)
        if (token) {
          const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
          )
          await oauth2Client.revokeToken(token)
        }
      } catch (revokeError) {
        // Log but don't fail if revocation fails
        console.warn('[Gmail Disconnect] Token revocation failed:', revokeError)
      }
    }

    // Delete gmail_account entry
    const { error: deleteError } = await supabase
      .from('gmail_accounts')
      .delete()
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[Gmail Disconnect] Delete error:', deleteError)
      return NextResponse.json(
        { error: 'Falha ao desligar conta Gmail' },
        { status: 500 }
      )
    }

    // Clear drive folder settings
    await supabase
      .from('user_settings')
      .update({
        drive_folder_id: null,
        drive_folder_name: null,
        drive_folder_path: null,
      })
      .eq('user_id', user.id)

    return NextResponse.json({
      success: true,
      message: 'Conta Gmail desligada com sucesso'
    })

  } catch (error) {
    console.error('[Gmail Disconnect] Error:', error)
    return NextResponse.json(
      { error: 'Falha ao desligar conta Gmail' },
      { status: 500 }
    )
  }
}
