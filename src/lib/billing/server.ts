'use server'

import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type {
    BillingCreditLedgerType,
    BillingCreditPoolType,
    OrganizationBillingAccount
} from '@/types/database'
import { buildOrganizationBillingSnapshot, type OrganizationBillingSnapshot } from '@/lib/billing/snapshot'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

function isMissingBillingTableError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null; message?: string | null }
    if (candidate.code === '42P01') return true

    return typeof candidate.message === 'string'
        && (
            candidate.message.includes('organization_billing_accounts')
            || candidate.message.includes('organization_credit_ledger')
        )
}

export interface BillingLedgerEntry {
    id: string
    entryType: BillingCreditLedgerType
    creditPool: BillingCreditPoolType
    creditsDelta: number
    balanceAfter: number
    reason: string | null
    metadata: unknown
    createdAt: string
}

export async function getOrganizationBillingSnapshot(
    organizationId: string,
    options?: { supabase?: SupabaseClient }
): Promise<OrganizationBillingSnapshot | null> {
    if (!options?.supabase) {
        return getOrganizationBillingSnapshotCached(organizationId)
    }

    return getOrganizationBillingSnapshotWithSupabase(options.supabase, organizationId)
}

const getOrganizationBillingSnapshotCached = cache(async (organizationId: string) => {
    const supabase = await createClient()
    return getOrganizationBillingSnapshotWithSupabase(supabase, organizationId)
})

async function getOrganizationBillingSnapshotWithSupabase(
    supabase: SupabaseClient,
    organizationId: string
): Promise<OrganizationBillingSnapshot | null> {
    const { data, error } = await supabase
        .from('organization_billing_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to load organization billing snapshot:', error)
        }
        return null
    }

    if (!data) return null
    return buildOrganizationBillingSnapshot(data as OrganizationBillingAccount)
}

export async function getOrganizationBillingLedger(
    organizationId: string,
    options?: {
        limit?: number
        supabase?: SupabaseClient
    }
): Promise<BillingLedgerEntry[]> {
    const supabase = options?.supabase ?? await createClient()
    const limit = Number.isFinite(options?.limit) ? Math.max(1, Math.min(100, Math.floor(options?.limit as number))) : 15

    const { data, error } = await supabase
        .from('organization_credit_ledger')
        .select('id, entry_type, credit_pool, credits_delta, balance_after, reason, metadata, created_at')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })
        .limit(limit)

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to load organization billing ledger:', error)
        }
        return []
    }

    return (data ?? []).map((entry) => ({
        id: entry.id,
        entryType: entry.entry_type,
        creditPool: entry.credit_pool,
        creditsDelta: Number(entry.credits_delta ?? 0),
        balanceAfter: Number(entry.balance_after ?? 0),
        reason: entry.reason,
        metadata: entry.metadata,
        createdAt: entry.created_at
    }))
}
