'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cancelIyzicoSubscription, IyzicoClientError } from '@/lib/billing/providers/iyzico/client'
import { getBillingProviderConfig } from '@/lib/billing/providers/config'
import { createClient } from '@/lib/supabase/server'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type RenewalAction = 'cancel' | 'resume'
export type RenewalActionStatus = 'success' | 'blocked' | 'error'
export type RenewalActionError =
    | 'unauthorized'
    | 'invalid_input'
    | 'not_available'
    | 'request_failed'
    | 'admin_locked'
    | 'premium_required'

export interface RenewalActionResult {
    ok: boolean
    status: RenewalActionStatus
    error: RenewalActionError | null
}

export interface SubscriptionRenewalState {
    autoRenew: boolean
    cancelAtPeriodEnd: boolean
    cancellationRequestedAt: string | null
    periodEnd: string | null
    pendingPlanChange: PendingPlanChange | null
}

interface RenewalRpcPayload {
    ok?: boolean
    status?: string
    reason?: string
}

interface SubscriptionMetadataState {
    autoRenew: boolean
    cancelAtPeriodEnd: boolean
    cancellationRequestedAt: string | null
    pendingPlanChange: PendingPlanChange | null
}

export interface PendingPlanChange {
    changeType: string
    requestedMonthlyCredits: number
    requestedMonthlyPriceTry: number
    effectiveAt: string | null
    requestedAt: string | null
}

interface SubscriptionRenewalRow {
    id: string
    organization_id: string
    provider: string
    provider_subscription_id: string | null
    status: string
    metadata: unknown
    period_end: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function errorResult(error: RenewalActionError): RenewalActionResult {
    return {
        ok: false,
        status: 'error',
        error
    }
}

function createServiceRoleClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !serviceRoleKey) return null

    return createServiceClient(url, serviceRoleKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false
        }
    })
}

function isNotAvailableRpcError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null }
    return candidate.code === '42883' || candidate.code === 'PGRST202' || candidate.code === '42P01'
}

function parseRpcPayload(data: unknown): RenewalRpcPayload | null {
    if (!data || typeof data !== 'object') return null
    return data as RenewalRpcPayload
}

function mapRpcPayloadToResult(payload: RenewalRpcPayload | null): RenewalActionResult {
    if (!payload?.status) {
        return {
            ok: false,
            status: 'error',
            error: 'request_failed'
        }
    }

    if (payload.status === 'success') {
        return {
            ok: true,
            status: 'success',
            error: null
        }
    }

    if (payload.status === 'blocked') {
        if (payload.reason === 'admin_locked' || payload.reason === 'premium_required') {
            return {
                ok: false,
                status: 'blocked',
                error: payload.reason
            }
        }

        return {
            ok: false,
            status: 'blocked',
            error: 'request_failed'
        }
    }

    return {
        ok: false,
        status: 'error',
        error: 'request_failed'
    }
}

function parseSubscriptionMetadata(metadata: unknown): SubscriptionMetadataState {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
        return {
            autoRenew: true,
            cancelAtPeriodEnd: false,
            cancellationRequestedAt: null,
            pendingPlanChange: null
        }
    }

    const candidate = metadata as Record<string, unknown>
    const cancelAtPeriodEnd = candidate.cancel_at_period_end === true
    const autoRenew = typeof candidate.auto_renew === 'boolean'
        ? candidate.auto_renew
        : !cancelAtPeriodEnd
    const cancellationRequestedAt = typeof candidate.cancellation_requested_at === 'string'
        ? candidate.cancellation_requested_at
        : null
    let pendingPlanChange: PendingPlanChange | null = null
    const pendingCandidate = candidate.pending_plan_change
    if (pendingCandidate && typeof pendingCandidate === 'object' && !Array.isArray(pendingCandidate)) {
        const pending = pendingCandidate as Record<string, unknown>
        const requestedMonthlyCredits = Number(pending.requested_monthly_credits ?? 0)
        const requestedMonthlyPriceTry = Number(pending.requested_monthly_price_try ?? 0)
        const changeType = typeof pending.change_type === 'string' ? pending.change_type : 'unknown'
        pendingPlanChange = {
            changeType,
            requestedMonthlyCredits: Number.isFinite(requestedMonthlyCredits) ? requestedMonthlyCredits : 0,
            requestedMonthlyPriceTry: Number.isFinite(requestedMonthlyPriceTry) ? requestedMonthlyPriceTry : 0,
            effectiveAt: typeof pending.effective_at === 'string' ? pending.effective_at : null,
            requestedAt: typeof pending.requested_at === 'string' ? pending.requested_at : null
        }
    }

    return {
        autoRenew,
        cancelAtPeriodEnd,
        cancellationRequestedAt,
        pendingPlanChange
    }
}

export async function getSubscriptionRenewalState(input: {
    organizationId: string
    supabase?: SupabaseClient
}): Promise<SubscriptionRenewalState> {
    if (!input.organizationId) {
        return {
            autoRenew: true,
            cancelAtPeriodEnd: false,
            cancellationRequestedAt: null,
            periodEnd: null,
            pendingPlanChange: null
        }
    }

    const supabase = input.supabase ?? await createClient()
    const { data, error } = await supabase
        .from('organization_subscription_records')
        .select('metadata, period_end')
        .eq('organization_id', input.organizationId)
        .in('status', ['active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error('Failed to load subscription renewal state:', error)
        return {
            autoRenew: true,
            cancelAtPeriodEnd: false,
            cancellationRequestedAt: null,
            periodEnd: null,
            pendingPlanChange: null
        }
    }

    const row = data as SubscriptionRenewalRow | null
    if (!row) {
        return {
            autoRenew: true,
            cancelAtPeriodEnd: false,
            cancellationRequestedAt: null,
            periodEnd: null,
            pendingPlanChange: null
        }
    }

    const metadataState = parseSubscriptionMetadata(row.metadata)
    return {
        ...metadataState,
        periodEnd: row.period_end
    }
}

async function runRenewalAction(input: {
    action: RenewalAction
    organizationId: string
    reason?: string | null
}): Promise<RenewalActionResult> {
    if (!input.organizationId) {
        return errorResult('invalid_input')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return errorResult('unauthorized')
    }

    const providerConfig = getBillingProviderConfig()
    if (providerConfig.provider === 'iyzico') {
        if (input.action === 'resume') {
            return errorResult('not_available')
        }

        const membershipCheck = await supabase.rpc('assert_org_member_or_admin', {
            target_organization_id: input.organizationId
        })
        if (membershipCheck.error) {
            return errorResult('unauthorized')
        }

        const { data: subscriptionData, error: subscriptionError } = await supabase
            .from('organization_subscription_records')
            .select('id, organization_id, provider, provider_subscription_id, status, metadata, period_end')
            .eq('organization_id', input.organizationId)
            .in('status', ['active', 'past_due'])
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle()

        if (subscriptionError) {
            console.error('Failed to load iyzico subscription row for cancel:', subscriptionError)
            return errorResult('request_failed')
        }

        const subscriptionRow = subscriptionData as SubscriptionRenewalRow | null
        if (!subscriptionRow || subscriptionRow.provider !== 'iyzico' || !subscriptionRow.provider_subscription_id) {
            return errorResult('not_available')
        }

        try {
            await cancelIyzicoSubscription({
                subscriptionReferenceCode: subscriptionRow.provider_subscription_id
            })
        } catch (error) {
            console.error('cancelIyzicoSubscription failed:', error)
            if (error instanceof IyzicoClientError && error.code === 'provider_not_configured') {
                return errorResult('not_available')
            }
            return errorResult('request_failed')
        }

        const serviceSupabase = createServiceRoleClient()
        if (!serviceSupabase) {
            return errorResult('request_failed')
        }

        const nowIso = new Date().toISOString()
        const nextMetadata = {
            ...asRecord(subscriptionRow.metadata),
            auto_renew: false,
            cancel_at_period_end: true,
            cancellation_requested_at: nowIso,
            canceled_by: 'self_serve',
            canceled_via_provider: 'iyzico',
            canceled_reason: input.reason ?? null,
            provider_canceled_at: nowIso
        }

        const { error: subscriptionUpdateError } = await serviceSupabase
            .from('organization_subscription_records')
            .update({
                metadata: nextMetadata
            })
            .eq('id', subscriptionRow.id)

        if (subscriptionUpdateError) {
            console.error('Failed to persist iyzico subscription cancel state:', subscriptionUpdateError)
            return errorResult('request_failed')
        }

        const { error: billingUpdateError } = await serviceSupabase
            .from('organization_billing_accounts')
            .update({
                last_manual_action_at: nowIso,
                updated_at: nowIso
            })
            .eq('organization_id', input.organizationId)

        if (billingUpdateError) {
            console.error('Failed to persist iyzico billing cancel state:', billingUpdateError)
            return errorResult('request_failed')
        }

        return {
            ok: true,
            status: 'success',
            error: null
        }
    }

    const rpcName = input.action === 'cancel'
        ? 'mock_subscription_cancel_renewal'
        : 'mock_subscription_resume_renewal'

    const { data, error } = await supabase.rpc(rpcName, {
        target_organization_id: input.organizationId,
        action_reason: input.reason ?? null
    })

    if (error) {
        console.error(`${rpcName} failed:`, error)
        return errorResult(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return mapRpcPayloadToResult(parseRpcPayload(data))
}

export async function cancelSubscriptionRenewal(input: {
    organizationId: string
    reason?: string | null
}) {
    return runRenewalAction({
        action: 'cancel',
        organizationId: input.organizationId,
        reason: input.reason ?? null
    })
}

export async function resumeSubscriptionRenewal(input: {
    organizationId: string
    reason?: string | null
}) {
    return runRenewalAction({
        action: 'resume',
        organizationId: input.organizationId,
        reason: input.reason ?? null
    })
}
