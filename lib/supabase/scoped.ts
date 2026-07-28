/**
 * Tenant-scoped query helpers.
 *
 * Every server-side Supabase client in this project is a service-role client
 * (see lib/supabase/server.ts), which means Row-Level Security never applies.
 * Tenant isolation therefore depends entirely on remembering to write
 * `.eq('user_id', user.id)` on every single query — and a single omission is a
 * cross-tenant data leak.
 *
 * These helpers make the filter structural instead of remembered. Prefer them
 * over raw `supabase.from(...)` in any route that touches user-owned data:
 *
 *     const db = scoped(supabase, user.id)
 *     const { data } = await db.select('documents', 'id, filename')
 *     await db.update('documents', { status: 'approved' }).eq('id', documentId)
 *
 * The returned value is a normal PostgREST builder, so `.eq()`, `.order()`,
 * `.single()` etc. all chain as usual — the tenant filter is simply already
 * applied and cannot be chained away.
 *
 * scripts/audit-tenant-scoping.ts flags raw `.from('<owned table>')` calls that
 * bypass this module.
 */

import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Tables that hold user-owned rows, mapped to the column that identifies the
 * owner. `profiles` keys the owner on its primary key rather than `user_id`.
 */
export const OWNED_TABLES = {
    documents: 'user_id',
    user_settings: 'user_id',
    gmail_accounts: 'user_id',
    sync_jobs: 'user_id',
    user_feedback: 'user_id',
    sender_reputation: 'user_id',
    profiles: 'id',
} as const

export type OwnedTable = keyof typeof OWNED_TABLES

export function ownerColumn(table: OwnedTable): string {
    return OWNED_TABLES[table]
}

export interface ScopedDb {
    /** SELECT restricted to the scoped user. */
    select: (table: OwnedTable, columns?: string) => any
    /** UPDATE restricted to the scoped user. Chain `.eq('id', ...)` to narrow further. */
    update: (table: OwnedTable, values: Record<string, unknown>) => any
    /** DELETE restricted to the scoped user. */
    delete: (table: OwnedTable) => any
    /**
     * INSERT with the owner column forced to the scoped user, overriding any
     * value present in the payload. Accepts a single row or an array.
     */
    insert: (
        table: OwnedTable,
        values: Record<string, unknown> | Record<string, unknown>[],
    ) => any
    /** The user this instance is bound to. */
    userId: string
}

/**
 * Bind a service-role client to a single user.
 *
 * @param supabase - a service-role Supabase client
 * @param userId - the authenticated user's id; must come from the session,
 *                 never from request input
 */
export function scoped(supabase: SupabaseClient<any, any, any>, userId: string): ScopedDb {
    if (!userId) {
        // Failing loudly here is the whole point: an undefined userId silently
        // produces `user_id=is.null`, which matches nothing on a good day and
        // is a leak waiting to happen on a bad one.
        throw new Error('scoped() requires a userId')
    }

    const from = (table: OwnedTable) => (supabase as any).from(table)

    return {
        userId,

        select: (table, columns = '*') =>
            from(table).select(columns).eq(ownerColumn(table), userId),

        update: (table, values) =>
            from(table).update(values).eq(ownerColumn(table), userId),

        delete: (table) => from(table).delete().eq(ownerColumn(table), userId),

        insert: (table, values) => {
            const column = ownerColumn(table)
            const withOwner = Array.isArray(values)
                ? values.map((row) => ({ ...row, [column]: userId }))
                : { ...values, [column]: userId }

            return from(table).insert(withOwner)
        },
    }
}
