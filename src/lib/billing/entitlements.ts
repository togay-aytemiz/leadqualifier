import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { buildOrganizationBillingSnapshot, type OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import type { BillingLockReason, BillingMembershipState, OrganizationBillingAccount } from '@/types/database'

type SupabaseClientLike = SupabaseClient<Database>

export interface OrganizationUsageEntitlement {
    isUsageAllowed: boolean
    lockReason: BillingLockReason | null
    membershipState: BillingMembershipState | null
    snapshot: OrganizationBillingSnapshot | null
}

export class BillingUsageLockedError extends Error {
    lockReason: BillingLockReason | null
    membershipState: BillingMembershipState | null

    constructor(message: string, options?: {
        lockReason?: BillingLockReason | null
        membershipState?: BillingMembershipState | null
    }) {
        super(message)
        this.name = 'BillingUsageLockedError'
        this.lockReason = options?.lockReason ?? null
        this.membershipState = options?.membershipState ?? null
    }
}

function isMissingBillingTableError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null; message?: string | null }
    if (candidate.code === '42P01') return true

    return typeof candidate.message === 'string'
        && candidate.message.includes('organization_billing_accounts')
}

function buildFallbackEntitlement(): OrganizationUsageEntitlement {
    return {
        isUsageAllowed: true,
        lockReason: null,
        membershipState: null,
        snapshot: null
    }
}

export async function resolveOrganizationUsageEntitlement(
    organizationId: string,
    options?: {
        supabase?: SupabaseClientLike
    }
): Promise<OrganizationUsageEntitlement> {
    const supabase = options?.supabase ?? await createClient()

    const { data, error } = await supabase
        .from('organization_billing_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to resolve billing entitlement:', error)
        }
        return buildFallbackEntitlement()
    }

    if (!data) {
        return buildFallbackEntitlement()
    }

    const snapshot = buildOrganizationBillingSnapshot(data as OrganizationBillingAccount)

    return {
        isUsageAllowed: snapshot.isUsageAllowed,
        lockReason: snapshot.lockReason,
        membershipState: snapshot.membershipState,
        snapshot
    }
}

export async function assertOrganizationUsageAllowed(
    organizationId: string,
    options?: {
        supabase?: SupabaseClientLike
    }
) {
    const entitlement = await resolveOrganizationUsageEntitlement(organizationId, options)
    if (entitlement.isUsageAllowed) return entitlement

    throw new BillingUsageLockedError(
        `Billing usage is locked for organization ${organizationId}`,
        {
            lockReason: entitlement.lockReason,
            membershipState: entitlement.membershipState
        }
    )
}
