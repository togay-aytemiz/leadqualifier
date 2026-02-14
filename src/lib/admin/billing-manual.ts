'use server'

import { createClient } from '@/lib/supabase/server'
import type { BillingLockReason, BillingMembershipState } from '@/types/database'

export type AdminBillingActionError =
    | 'unauthorized'
    | 'forbidden'
    | 'invalid_input'
    | 'not_available'
    | 'request_failed'

export interface AdminBillingActionResult {
    ok: boolean
    error: AdminBillingActionError | null
}

interface AdminAuthContext {
    supabase: Awaited<ReturnType<typeof createClient>>
    userId: string
}

function success(): AdminBillingActionResult {
    return { ok: true, error: null }
}

function failure(error: AdminBillingActionError): AdminBillingActionResult {
    return { ok: false, error }
}

async function getAdminAuthContext(): Promise<AdminAuthContext | null> {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: profile, error } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .maybeSingle()

    if (error) {
        console.error('Failed to resolve system-admin profile state:', error)
        return null
    }

    if (!profile?.is_system_admin) {
        return {
            supabase,
            userId: user.id
        }
    }

    return {
        supabase,
        userId: user.id
    }
}

async function requireAdminContext(): Promise<{
    status: 'ok'
    context: AdminAuthContext
} | {
    status: 'unauthorized' | 'forbidden'
}> {
    const context = await getAdminAuthContext()
    if (!context?.userId) {
        return { status: 'unauthorized' }
    }

    const { data: profile, error } = await context.supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', context.userId)
        .maybeSingle()

    if (error) {
        console.error('Failed to verify system-admin role:', error)
        return { status: 'forbidden' }
    }

    if (!profile?.is_system_admin) {
        return { status: 'forbidden' }
    }

    return {
        status: 'ok',
        context
    }
}

function normalizeReason(reason: string) {
    const trimmed = reason.trim()
    if (!trimmed) return null
    return trimmed
}

function isNotAvailableRpcError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null; message?: string | null }
    return candidate.code === '42883' || candidate.code === 'PGRST202' || candidate.code === '42P01'
}

export async function adminExtendTrial(input: {
    organizationId: string
    trialEndsAtIso: string
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (!input.organizationId || !input.trialEndsAtIso || !reason) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_extend_trial', {
        target_organization_id: input.organizationId,
        new_trial_ends_at: input.trialEndsAtIso,
        action_reason: reason
    })

    if (error) {
        console.error('admin_extend_trial failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}

export async function adminAdjustTopupCredits(input: {
    organizationId: string
    creditDelta: number
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (!input.organizationId || !Number.isFinite(input.creditDelta) || !reason) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_adjust_topup_credits', {
        target_organization_id: input.organizationId,
        credit_delta: input.creditDelta,
        action_reason: reason
    })

    if (error) {
        console.error('admin_adjust_topup_credits failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}

export async function adminAssignPremium(input: {
    organizationId: string
    periodStartIso: string
    periodEndIso: string
    monthlyPriceTry: number
    monthlyCredits: number
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (
        !input.organizationId
        || !input.periodStartIso
        || !input.periodEndIso
        || !Number.isFinite(input.monthlyPriceTry)
        || !Number.isFinite(input.monthlyCredits)
        || !reason
    ) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_assign_premium', {
        target_organization_id: input.organizationId,
        period_start: input.periodStartIso,
        period_end: input.periodEndIso,
        monthly_price_try: input.monthlyPriceTry,
        monthly_credits: input.monthlyCredits,
        action_reason: reason
    })

    if (error) {
        console.error('admin_assign_premium failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}

export async function adminCancelPremium(input: {
    organizationId: string
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (!input.organizationId || !reason) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_cancel_premium', {
        target_organization_id: input.organizationId,
        action_reason: reason
    })

    if (error) {
        console.error('admin_cancel_premium failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}

export async function adminAdjustTrialCredits(input: {
    organizationId: string
    creditDelta: number
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (!input.organizationId || !Number.isFinite(input.creditDelta) || !reason) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_adjust_trial_credits', {
        target_organization_id: input.organizationId,
        credit_delta: input.creditDelta,
        action_reason: reason
    })

    if (error) {
        console.error('admin_adjust_trial_credits failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}

export async function adminAdjustPackageCredits(input: {
    organizationId: string
    creditDelta: number
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (!input.organizationId || !Number.isFinite(input.creditDelta) || !reason) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_adjust_package_credits', {
        target_organization_id: input.organizationId,
        credit_delta: input.creditDelta,
        action_reason: reason
    })

    if (error) {
        console.error('admin_adjust_package_credits failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}

const ALLOWED_MEMBERSHIP_STATES: BillingMembershipState[] = [
    'trial_active',
    'trial_exhausted',
    'premium_active',
    'past_due',
    'canceled',
    'admin_locked'
]

const ALLOWED_LOCK_REASONS: BillingLockReason[] = [
    'none',
    'trial_time_expired',
    'trial_credits_exhausted',
    'subscription_required',
    'package_credits_exhausted',
    'past_due',
    'admin_locked'
]

export async function adminSetMembershipOverride(input: {
    organizationId: string
    membershipState: BillingMembershipState
    lockReason: BillingLockReason
    reason: string
}): Promise<AdminBillingActionResult> {
    const reason = normalizeReason(input.reason)
    if (
        !input.organizationId
        || !reason
        || !ALLOWED_MEMBERSHIP_STATES.includes(input.membershipState)
        || !ALLOWED_LOCK_REASONS.includes(input.lockReason)
    ) {
        return failure('invalid_input')
    }

    const auth = await requireAdminContext()
    if (auth.status !== 'ok') {
        return failure(auth.status)
    }

    const { error } = await auth.context.supabase.rpc('admin_set_membership_override', {
        target_organization_id: input.organizationId,
        new_membership_state: input.membershipState,
        new_lock_reason: input.lockReason,
        action_reason: reason
    })

    if (error) {
        console.error('admin_set_membership_override failed:', error)
        return failure(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return success()
}
