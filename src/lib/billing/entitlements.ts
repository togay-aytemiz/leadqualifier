import type { SupabaseClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { Database } from '@/types/database'
import { buildOrganizationBillingSnapshot, type OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import type { BillingLockReason, BillingMembershipState, OrganizationBillingAccount } from '@/types/database'
import { renewDueManualAdminSubscription } from '@/lib/billing/manual-renewal'

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

function buildFailClosedEntitlement(): OrganizationUsageEntitlement {
    return {
        isUsageAllowed: false,
        lockReason: 'admin_locked',
        membershipState: 'admin_locked',
        snapshot: null
    }
}

function isProductionRuntime() {
    return process.env.NODE_ENV === 'production'
}

export async function resolveOrganizationUsageEntitlement(
    organizationId: string,
    options?: {
        supabase?: SupabaseClientLike
    }
): Promise<OrganizationUsageEntitlement> {
    const supabase = options?.supabase ?? await createClient()

    await renewDueManualAdminSubscription({
        organizationId,
        supabase
    })

    const { data, error } = await supabase
        .from('organization_billing_accounts')
        .select('*')
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error) {
        if (!isMissingBillingTableError(error)) {
            console.error('Failed to resolve billing entitlement:', error)
        }
        if (isProductionRuntime()) {
            return buildFailClosedEntitlement()
        }
        return buildFallbackEntitlement()
    }

    if (!data) {
        if (isProductionRuntime()) {
            return buildFailClosedEntitlement()
        }
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
