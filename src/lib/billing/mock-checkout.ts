'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'

export type MockPaymentOutcome = 'success' | 'failed'
export type MockCheckoutStatus = 'success' | 'scheduled' | 'failed' | 'blocked' | 'error'
export type MockCheckoutError =
    | 'unauthorized'
    | 'invalid_input'
    | 'not_available'
    | 'request_failed'
    | 'topup_not_allowed'
    | 'admin_locked'

export interface MockCheckoutResult {
    ok: boolean
    status: MockCheckoutStatus
    error: MockCheckoutError | null
    changeType?: string | null
    effectiveAt?: string | null
}

interface MockCheckoutRpcPayload {
    ok?: boolean
    status?: string
    reason?: string
    change_type?: string
    effective_at?: string
}

interface BillingAccountFallbackRow {
    membership_state: string
    lock_reason: string
    monthly_package_credit_limit: number
    monthly_package_credit_used: number
    topup_credit_balance: number
}

function errorResult(error: MockCheckoutError): MockCheckoutResult {
    return {
        ok: false,
        status: 'error',
        error,
        changeType: null,
        effectiveAt: null
    }
}

function isValidOutcome(outcome: string): outcome is MockPaymentOutcome {
    return outcome === 'success' || outcome === 'failed'
}

function isNotAvailableRpcError(error: unknown) {
    if (!error || typeof error !== 'object') return false
    const candidate = error as { code?: string | null }
    return candidate.code === '42883' || candidate.code === 'PGRST202' || candidate.code === '42P01'
}

function parseRpcPayload(data: unknown): MockCheckoutRpcPayload | null {
    if (!data || typeof data !== 'object') return null
    return data as MockCheckoutRpcPayload
}

function mapRpcPayloadToResult(payload: MockCheckoutRpcPayload | null): MockCheckoutResult {
    if (!payload?.status) {
        return {
            ok: false,
            status: 'error',
            error: 'request_failed',
            changeType: null,
            effectiveAt: null
        }
    }

    if (payload.status === 'success') {
        return {
            ok: true,
            status: 'success',
            error: null,
            changeType: typeof payload.change_type === 'string' ? payload.change_type : null,
            effectiveAt: typeof payload.effective_at === 'string' ? payload.effective_at : null
        }
    }

    if (payload.status === 'scheduled') {
        return {
            ok: true,
            status: 'scheduled',
            error: null,
            changeType: typeof payload.change_type === 'string' ? payload.change_type : null,
            effectiveAt: typeof payload.effective_at === 'string' ? payload.effective_at : null
        }
    }

    if (payload.status === 'failed') {
        return {
            ok: false,
            status: 'failed',
            error: null,
            changeType: null,
            effectiveAt: null
        }
    }

    if (payload.status === 'blocked') {
        const reason = payload.reason
        if (reason === 'topup_not_allowed' || reason === 'admin_locked') {
            return {
                ok: false,
                status: 'blocked',
                error: reason,
                changeType: null,
                effectiveAt: null
            }
        }

        return {
            ok: false,
            status: 'blocked',
            error: 'request_failed',
            changeType: null,
            effectiveAt: null
        }
    }

    return {
        ok: false,
        status: 'error',
        error: 'request_failed',
        changeType: null,
        effectiveAt: null
    }
}

function toNonNegativeNumber(value: unknown) {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
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

async function tryLegacyPremiumTopupFallback(input: {
    tenantSupabase: Awaited<ReturnType<typeof createClient>>
    organizationId: string
    userId: string
    simulatedOutcome: MockPaymentOutcome
    credits: number
    amountTry: number
}): Promise<MockCheckoutResult | null> {
    const membershipCheck = await input.tenantSupabase.rpc('assert_org_member_or_admin', {
        target_organization_id: input.organizationId
    })
    if (membershipCheck.error) {
        return null
    }

    const { data: billingData, error: billingError } = await input.tenantSupabase
        .from('organization_billing_accounts')
        .select('membership_state, lock_reason, monthly_package_credit_limit, monthly_package_credit_used, topup_credit_balance')
        .eq('organization_id', input.organizationId)
        .maybeSingle()

    if (billingError || !billingData) {
        return null
    }

    const billing = billingData as BillingAccountFallbackRow
    if (billing.membership_state !== 'premium_active') {
        return null
    }
    if (billing.lock_reason === 'admin_locked') {
        return {
            ok: false,
            status: 'blocked',
            error: 'admin_locked'
        }
    }

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase) {
        return null
    }

    const creditsSafe = toNonNegativeNumber(input.credits)
    const amountSafe = toNonNegativeNumber(input.amountTry)
    const remainingPackage = Math.max(
        0,
        toNonNegativeNumber(billing.monthly_package_credit_limit) - toNonNegativeNumber(billing.monthly_package_credit_used)
    )

    const orderCheckoutId = `mock_chk_compat_${crypto.randomUUID().replace(/-/g, '')}`
    const { data: orderRow, error: orderError } = await serviceSupabase
        .from('credit_purchase_orders')
        .insert({
            organization_id: input.organizationId,
            provider: 'mock',
            provider_checkout_id: orderCheckoutId,
            status: 'pending',
            credits: creditsSafe,
            amount_try: amountSafe,
            currency: 'TRY',
            metadata: { simulated_outcome: input.simulatedOutcome, source: 'legacy_topup_policy_fallback' }
        })
        .select('id')
        .maybeSingle()

    if (orderError || !orderRow?.id) {
        console.error('legacy premium top-up fallback failed (order create):', orderError)
        return null
    }

    if (input.simulatedOutcome === 'failed') {
        await serviceSupabase
            .from('credit_purchase_orders')
            .update({
                status: 'failed',
                metadata: { result: 'failed', source: 'legacy_topup_policy_fallback' }
            })
            .eq('id', orderRow.id)

        return {
            ok: false,
            status: 'failed',
            error: null,
            changeType: null,
            effectiveAt: null
        }
    }

    const currentTopup = toNonNegativeNumber(billing.topup_credit_balance)
    const nextTopupBalance = currentTopup + creditsSafe

    const billingUpdate = await serviceSupabase
        .from('organization_billing_accounts')
        .update({
            topup_credit_balance: nextTopupBalance,
            lock_reason: 'none'
        })
        .eq('organization_id', input.organizationId)

    if (billingUpdate.error) {
        console.error('legacy premium top-up fallback failed (billing update):', billingUpdate.error)
        return null
    }

    const paymentId = `mock_pay_compat_${crypto.randomUUID().replace(/-/g, '')}`
    const orderUpdate = await serviceSupabase
        .from('credit_purchase_orders')
        .update({
            status: 'paid',
            provider_payment_id: paymentId,
            paid_at: new Date().toISOString(),
            metadata: { result: 'success', source: 'legacy_topup_policy_fallback' }
        })
        .eq('id', orderRow.id)

    if (orderUpdate.error) {
        console.error('legacy premium top-up fallback failed (order update):', orderUpdate.error)
        return null
    }

    const ledgerInsert = await serviceSupabase
        .from('organization_credit_ledger')
        .insert({
            organization_id: input.organizationId,
            entry_type: 'purchase_credit',
            credit_pool: 'topup_pool',
            credits_delta: creditsSafe,
            balance_after: remainingPackage + nextTopupBalance,
            performed_by: input.userId,
            reason: 'Mock top-up checkout success',
            metadata: {
                source: 'legacy_topup_policy_fallback',
                order_id: orderRow.id
            }
        })

    if (ledgerInsert.error) {
        console.error('legacy premium top-up fallback failed (ledger insert):', ledgerInsert.error)
        return null
    }

    return {
        ok: true,
        status: 'success',
        error: null,
        changeType: null,
        effectiveAt: null
    }
}

export async function simulateMockSubscriptionCheckout(input: {
    organizationId: string
    simulatedOutcome: MockPaymentOutcome
    monthlyPriceTry: number
    monthlyCredits: number
}): Promise<MockCheckoutResult> {
    if (
        !input.organizationId
        || !isValidOutcome(input.simulatedOutcome)
        || !Number.isFinite(input.monthlyPriceTry)
        || input.monthlyPriceTry < 0
        || !Number.isFinite(input.monthlyCredits)
        || input.monthlyCredits <= 0
    ) {
        return errorResult('invalid_input')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return errorResult('unauthorized')
    }

    const { data, error } = await supabase.rpc('mock_checkout_subscribe', {
        target_organization_id: input.organizationId,
        requested_monthly_price_try: input.monthlyPriceTry,
        requested_monthly_credits: input.monthlyCredits,
        simulated_outcome: input.simulatedOutcome
    })

    if (error) {
        console.error('mock_checkout_subscribe failed:', error)
        return errorResult(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    return mapRpcPayloadToResult(parseRpcPayload(data))
}

export async function simulateMockTopupCheckout(input: {
    organizationId: string
    simulatedOutcome: MockPaymentOutcome
    credits: number
    amountTry: number
}): Promise<MockCheckoutResult> {
    if (
        !input.organizationId
        || !isValidOutcome(input.simulatedOutcome)
        || !Number.isFinite(input.credits)
        || input.credits <= 0
        || !Number.isFinite(input.amountTry)
        || input.amountTry < 0
    ) {
        return errorResult('invalid_input')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
        return errorResult('unauthorized')
    }

    const { data, error } = await supabase.rpc('mock_checkout_topup', {
        target_organization_id: input.organizationId,
        requested_credits: input.credits,
        requested_amount_try: input.amountTry,
        simulated_outcome: input.simulatedOutcome
    })

    if (error) {
        console.error('mock_checkout_topup failed:', error)
        return errorResult(isNotAvailableRpcError(error) ? 'not_available' : 'request_failed')
    }

    const mappedResult = mapRpcPayloadToResult(parseRpcPayload(data))
    if (mappedResult.status === 'blocked' && mappedResult.error === 'topup_not_allowed') {
        const fallbackResult = await tryLegacyPremiumTopupFallback({
            tenantSupabase: supabase,
            organizationId: input.organizationId,
            userId: user.id,
            simulatedOutcome: input.simulatedOutcome,
            credits: input.credits,
            amountTry: input.amountTry
        })
        if (fallbackResult) {
            return fallbackResult
        }
    }

    return mappedResult
}
