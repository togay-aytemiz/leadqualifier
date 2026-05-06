'use server'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

type SupabaseClientLike = SupabaseClient<Database> | {
    rpc?: (functionName: string, args?: Record<string, unknown>) => Promise<{ data?: unknown; error?: unknown }>
}
type ManualRenewalRpc = (
    functionName: 'renew_due_manual_admin_subscription',
    args: { target_organization_id: string }
) => Promise<{ data?: unknown; error?: unknown }>

export type ManualRenewalStatus =
    | 'renewed'
    | 'not_due'
    | 'not_manual'
    | 'not_available'
    | 'skipped'
    | 'error'

export interface ManualRenewalResult {
    status: ManualRenewalStatus
    renewedPeriods: number
}

function parseManualRenewalResult(data: unknown): ManualRenewalResult {
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
        return { status: 'skipped', renewedPeriods: 0 }
    }

    const payload = data as Record<string, unknown>
    const status = typeof payload.status === 'string'
        ? payload.status
        : 'skipped'
    const renewedPeriods = Number(payload.renewed_periods ?? 0)

    return {
        status: (
            status === 'renewed'
            || status === 'not_due'
            || status === 'not_manual'
            || status === 'not_available'
            || status === 'error'
        )
            ? status
            : 'skipped',
        renewedPeriods: Number.isFinite(renewedPeriods) ? Math.max(0, renewedPeriods) : 0
    }
}

function isNotAvailableRpcError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null }
    return candidate.code === '42883' || candidate.code === 'PGRST202' || candidate.code === '42P01'
}

export async function renewDueManualAdminSubscription(input: {
    organizationId: string
    supabase: SupabaseClientLike
}): Promise<ManualRenewalResult> {
    if (!input.organizationId || typeof input.supabase.rpc !== 'function') {
        return { status: 'skipped', renewedPeriods: 0 }
    }

    const rpc = input.supabase.rpc as ManualRenewalRpc
    const { data, error } = await rpc('renew_due_manual_admin_subscription', {
        target_organization_id: input.organizationId
    })

    if (error) {
        if (isNotAvailableRpcError(error)) {
            return { status: 'not_available', renewedPeriods: 0 }
        }

        console.error('renew_due_manual_admin_subscription failed:', error)
        return { status: 'error', renewedPeriods: 0 }
    }

    return parseManualRenewalResult(data)
}
