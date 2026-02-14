'use server'

import { createClient } from '@/lib/supabase/server'

export type MockPaymentOutcome = 'success' | 'failed'
export type MockCheckoutStatus = 'success' | 'failed' | 'blocked' | 'error'
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
}

interface MockCheckoutRpcPayload {
    ok?: boolean
    status?: string
    reason?: string
}

function errorResult(error: MockCheckoutError): MockCheckoutResult {
    return {
        ok: false,
        status: 'error',
        error
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

    if (payload.status === 'failed') {
        return {
            ok: false,
            status: 'failed',
            error: null
        }
    }

    if (payload.status === 'blocked') {
        const reason = payload.reason
        if (reason === 'topup_not_allowed' || reason === 'admin_locked') {
            return {
                ok: false,
                status: 'blocked',
                error: reason
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

    return mapRpcPayloadToResult(parseRpcPayload(data))
}
