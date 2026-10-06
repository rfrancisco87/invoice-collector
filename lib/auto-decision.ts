/**
 * Rule-based auto-decision pipeline.
 *
 * Given a newly-ingested document's fingerprint, decide whether we already
 * have enough feedback history to auto-reject (or auto-approve) it without
 * asking the user. The rules are intentionally simple and deterministic —
 * we are not using an LLM.
 *
 * Signals we trust, in order:
 *   1. file_hash has been rejected before  → auto-reject (exact duplicate)
 *   2. sender_reputation.is_blocked        → auto-reject (domain consistently rejected)
 *   3. sender_reputation.is_trusted        → auto-approve (opt-in, gated by setting)
 *
 * The sender_reputation table is maintained automatically by the
 * update_sender_reputation() trigger on user_feedback — we just read it.
 * Auto-decisions deliberately do NOT insert into user_feedback, so the
 * counters stay anchored to real user judgments.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export type AutoDecisionAction = 'reject' | 'approve'

export interface AutoDecision {
    action: AutoDecisionAction
    /** Short machine-readable tag stored in documents.auto_action_reason */
    reason: AutoDecisionReason
    /** Human-readable description for logs / UI */
    description: string
}

export type AutoDecisionReason =
    | 'file_hash_rejected'
    | 'sender_blocked'
    | 'sender_trusted'

export interface AutoDecisionInput {
    userId: string
    fileHash: string
    senderDomain: string | null
    /**
     * Where the document came from. Sender reputation only means something for
     * mail sent directly by a supplier; inbox-folder files all carry the
     * placeholder domain drive.google.com, so one rejection there counted
     * against every file the user ever drops in the folder.
     */
    source?: 'gmail' | 'inbox_folder' | 'forwarding' | 'upload'
    settings: {
        notification_email?: string | null
        auto_reject_enabled?: boolean | null
        auto_approve_enabled?: boolean | null
    }
}

/**
 * Returns an auto-decision if one applies, or null to leave the document
 * as 'pending' for manual review.
 */
export async function checkAutoDecision(
    supabase: SupabaseClient,
    input: AutoDecisionInput,
): Promise<AutoDecision | null> {
    const { userId, fileHash, senderDomain, settings } = input

    const autoRejectEnabled = settings.auto_reject_enabled !== false // default on
    const autoApproveEnabled = settings.auto_approve_enabled === true // default off

    // Rule 1: exact file already rejected by this user.
    // Strongest possible signal — same bytes, same user said no.
    if (autoRejectEnabled) {
        const { data: priorRejection } = await supabase
            .from('documents')
            .select('id')
            .eq('user_id', userId)
            .eq('file_hash', fileHash)
            .eq('status', 'rejected')
            .limit(1)
            .maybeSingle()

        if (priorRejection) {
            return {
                action: 'reject',
                reason: 'file_hash_rejected',
                description: 'Este ficheiro já foi rejeitado anteriormente',
            }
        }
    }

    // Rules 2 & 3 need the sender domain.
    if (!senderDomain) return null
    if (input.source && input.source !== 'gmail') return null

    const { data: reputation } = await supabase
        .from('sender_reputation')
        .select('is_blocked, is_trusted')
        .eq('user_id', userId)
        .eq('sender_domain', senderDomain)
        .maybeSingle()

    if (!reputation) return null
    if (!reputation.is_blocked && !reputation.is_trusted) return null

    // Mail from the user's own domains is forwarded documents from many
    // different suppliers (and a shared mailbox domain like gmail.com is
    // thousands of unrelated senders), so a domain-wide verdict would block
    // real invoices — which is how forwarded invoices were silently lost.
    if (await isNonSupplierDomain(supabase, userId, senderDomain, settings.notification_email)) {
        return null
    }

    // A sender the user has approved before is never auto-blocked, even if
    // the stored flag says so (rows written before migration 031).
    if (autoRejectEnabled && reputation.is_blocked && !reputation.is_trusted) {
        return {
            action: 'reject',
            reason: 'sender_blocked',
            description: `Documentos de ${senderDomain} têm sido consistentemente rejeitados`,
        }
    }

    if (autoApproveEnabled && reputation.is_trusted) {
        return {
            action: 'approve',
            reason: 'sender_trusted',
            description: `Documentos de ${senderDomain} são consistentemente aprovados`,
        }
    }

    return null
}

/** Shared mailbox providers: the domain says nothing about who sent the mail. */
const PUBLIC_MAIL_DOMAINS = new Set([
    'gmail.com', 'googlemail.com', 'outlook.com', 'outlook.pt', 'hotmail.com',
    'hotmail.pt', 'live.com', 'live.com.pt', 'msn.com', 'icloud.com', 'me.com',
    'mac.com', 'yahoo.com', 'yahoo.com.br', 'aol.com', 'proton.me',
    'protonmail.com', 'gmx.com', 'gmx.net', 'sapo.pt', 'iol.pt', 'clix.pt',
    'netcabo.pt', 'mail.com', 'zoho.com',
])

function domainOf(email: string | null | undefined): string | null {
    const domain = email?.split('@')[1]?.trim().toLowerCase()
    return domain || null
}

/**
 * True when the domain belongs to the user (login, connected Gmail or
 * notification address) or is a public mailbox provider.
 */
async function isNonSupplierDomain(
    supabase: SupabaseClient,
    userId: string,
    senderDomain: string,
    notificationEmail: string | null | undefined,
): Promise<boolean> {
    const domain = senderDomain.toLowerCase()
    if (PUBLIC_MAIL_DOMAINS.has(domain)) return true
    if (domainOf(notificationEmail) === domain) return true

    const [{ data: profile }, { data: accounts }] = await Promise.all([
        supabase.from('profiles').select('email').eq('id', userId).maybeSingle(),
        supabase.from('gmail_accounts').select('email').eq('user_id', userId),
    ])

    const ownEmails = [(profile as any)?.email, ...((accounts as any[]) ?? []).map((a) => a.email)]
    return ownEmails.some((email) => domainOf(email) === domain)
}
