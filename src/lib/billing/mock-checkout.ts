'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import type { BillingPlanTierId } from '@/lib/billing/pricing-catalog'
import { getBillingProviderConfig, getIyzicoPlanReferenceCode } from '@/lib/billing/providers/config'
import {
    initializeIyzicoSubscriptionCheckout,
    initializeIyzicoTopupCheckout,
    IyzicoClientError,
    upgradeIyzicoSubscription
} from '@/lib/billing/providers/iyzico/client'
import {
    extractIyzicoSubscriptionReferenceCode,
    extractIyzicoSubscriptionStartEnd
} from '@/lib/billing/providers/iyzico/checkout-result'
import {
    mapIyzicoProviderFailureToCheckoutError,
    type IyzicoCheckoutFailureReason
} from '@/lib/billing/providers/iyzico/error-map'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'

export type MockPaymentOutcome = 'success' | 'failed'
export type MockCheckoutStatus = 'success' | 'scheduled' | 'failed' | 'blocked' | 'error' | 'redirect'
export type MockCheckoutError =
    | 'unauthorized'
    | 'invalid_input'
    | 'legal_consent_required'
    | 'not_available'
    | 'request_failed'
    | 'topup_not_allowed'
    | 'admin_locked'
    | 'provider_not_configured'
    | IyzicoCheckoutFailureReason

export interface MockCheckoutResult {
    ok: boolean
    status: MockCheckoutStatus
    error: MockCheckoutError | null
    changeType?: string | null
    effectiveAt?: string | null
    redirectUrl?: string | null
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

interface ProfileRow {
    full_name: string | null
    email: string | null
}

interface OrganizationRow {
    name: string
}

interface BillingProfileRow {
    company_name: string
    billing_email: string
    billing_phone: string | null
    tax_identity_number: string | null
    address_line_1: string | null
    city: string | null
    postal_code: string | null
    country: string | null
}

interface ActiveSubscriptionRecordRow {
    id: string
    status: string
    provider_subscription_id: string | null
    period_start: string | null
    period_end: string | null
    metadata: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function toErrorMessage(error: unknown) {
    if (error instanceof Error && error.message) return error.message
    return typeof error === 'string' ? error : 'Unknown error'
}

function resolveScheduledDowngradeEffectiveAt(input: {
    providerStartAt: string | null
    currentPeriodEnd: string | null
}) {
    const { providerStartAt, currentPeriodEnd } = input
    if (!providerStartAt) return currentPeriodEnd
    if (!currentPeriodEnd) return providerStartAt

    const providerStartAtMs = Date.parse(providerStartAt)
    const currentPeriodEndMs = Date.parse(currentPeriodEnd)

    if (!Number.isFinite(providerStartAtMs) || !Number.isFinite(currentPeriodEndMs)) {
        return currentPeriodEnd
    }

    return providerStartAtMs > currentPeriodEndMs
        ? providerStartAt
        : currentPeriodEnd
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

function withoutPendingPlanChange(metadata: Record<string, unknown>) {
    const nextMetadata = { ...metadata }
    delete nextMetadata.pending_plan_change
    return nextMetadata
}

function formatIyzicoDate(date: Date) {
    const pad = (value: number) => value.toString().padStart(2, '0')
    const year = date.getUTCFullYear()
    const month = pad(date.getUTCMonth() + 1)
    const day = pad(date.getUTCDate())
    const hour = pad(date.getUTCHours())
    const minute = pad(date.getUTCMinutes())
    const second = pad(date.getUTCSeconds())
    return `${year}-${month}-${day} ${hour}:${minute}:${second}`
}

function resolveIyzicoLocale(locale: string | null | undefined): 'tr' | 'en' {
    return (locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'tr'
}

function resolveRouteLocale(locale: string | null | undefined): 'tr' | 'en' {
    return resolveIyzicoLocale(locale)
}

function resolveDefaultCallbackBaseUrl() {
    const value = process.env.NEXT_PUBLIC_APP_URL?.trim()
    if (!value) return null

    try {
        return new URL(value).origin
    } catch {
        return null
    }
}

function resolveCheckoutCallbackUrl(input: {
    action: 'subscribe' | 'topup'
    callbackUrl?: string | null
    locale?: string | null
}) {
    const action = input.action
    const locale = resolveRouteLocale(input.locale)
    const callbackUrl = input.callbackUrl?.trim()
    if (callbackUrl) return callbackUrl

    const baseUrl = resolveDefaultCallbackBaseUrl()
    if (!baseUrl) return null
    const query = new URLSearchParams({
        action,
        locale
    })
    return `${baseUrl}/api/billing/iyzico/callback?${query.toString()}`
}

function splitNameParts(value: string | null | undefined) {
    const trimmed = (value ?? '').trim()
    if (!trimmed) {
        return {
            name: 'Qualy',
            surname: 'Customer'
        }
    }

    const parts = trimmed.split(/\s+/).filter(Boolean)
    const [name = 'Qualy', ...rest] = parts
    const surname = rest.join(' ').trim() || 'Customer'
    return { name, surname }
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

async function runLegacyMockSubscriptionCheckout(input: {
    organizationId: string
    simulatedOutcome: MockPaymentOutcome
    monthlyPriceTry: number
    monthlyCredits: number
}): Promise<MockCheckoutResult> {
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

async function runLegacyMockTopupCheckout(input: {
    organizationId: string
    simulatedOutcome: MockPaymentOutcome
    credits: number
    amountTry: number
}): Promise<MockCheckoutResult> {
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

async function loadIyzicoCheckoutContext(input: {
    organizationId: string
}) {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return {
            supabase,
            user: null as null,
            billing: null as BillingAccountFallbackRow | null
        }
    }

    const membership = await supabase.rpc('assert_org_member_or_admin', {
        target_organization_id: input.organizationId
    })
    if (membership.error) {
        return {
            supabase,
            user: null as null,
            billing: null as BillingAccountFallbackRow | null
        }
    }

    const billingResult = await supabase
        .from('organization_billing_accounts')
        .select('membership_state, lock_reason, monthly_package_credit_limit, monthly_package_credit_used, topup_credit_balance')
        .eq('organization_id', input.organizationId)
        .maybeSingle()

    if (billingResult.error || !billingResult.data) {
        return {
            supabase,
            user,
            billing: null as BillingAccountFallbackRow | null
        }
    }

    return {
        supabase,
        user,
        billing: billingResult.data as BillingAccountFallbackRow
    }
}

function mapIyzicoErrorToCheckoutError(error: unknown): MockCheckoutError {
    if (error instanceof IyzicoClientError) {
        if (error.code === 'provider_not_configured') {
            return 'provider_not_configured'
        }

        const providerFailure = mapIyzicoProviderFailureToCheckoutError(error)
        if (providerFailure) {
            return providerFailure
        }
    }
    return 'request_failed'
}

async function resolveProfileAndOrganization(input: {
    tenantSupabase: Awaited<ReturnType<typeof createClient>>
    userId: string
    organizationId: string
}) {
    const [{ data: profile }, { data: organization }, { data: billingProfile }] = await Promise.all([
        input.tenantSupabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', input.userId)
            .maybeSingle(),
        input.tenantSupabase
            .from('organizations')
            .select('name')
            .eq('id', input.organizationId)
            .maybeSingle(),
        input.tenantSupabase
            .from('organization_billing_profiles')
            .select('company_name, billing_email, billing_phone, tax_identity_number, address_line_1, city, postal_code, country')
            .eq('organization_id', input.organizationId)
            .maybeSingle()
    ])

    return {
        profile: (profile ?? null) as ProfileRow | null,
        organization: (organization ?? null) as OrganizationRow | null,
        billingProfile: (billingProfile ?? null) as BillingProfileRow | null
    }
}

async function resolveActiveIyzicoSubscriptionRecord(input: {
    tenantSupabase: Awaited<ReturnType<typeof createClient>>
    organizationId: string
}) {
    const { data, error } = await input.tenantSupabase
        .from('organization_subscription_records')
        .select('id, status, provider_subscription_id, period_start, period_end, metadata')
        .eq('organization_id', input.organizationId)
        .eq('provider', 'iyzico')
        .in('status', ['active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !data) {
        return null
    }

    return data as ActiveSubscriptionRecordRow
}

function resolvePlanIdFromCredits(input: {
    planId: BillingPlanTierId | null | undefined
    monthlyCredits: number
}): BillingPlanTierId | null {
    if (input.planId) return input.planId
    if (Math.round(input.monthlyCredits) === 1000) return 'starter'
    if (Math.round(input.monthlyCredits) === 2000) return 'growth'
    if (Math.round(input.monthlyCredits) === 4000) return 'scale'
    return null
}

export async function simulateMockSubscriptionCheckout(input: {
    organizationId: string
    simulatedOutcome: MockPaymentOutcome
    monthlyPriceTry: number
    monthlyCredits: number
    planId?: BillingPlanTierId | null
    callbackUrl?: string | null
    locale?: string | null
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

    const providerConfig = getBillingProviderConfig()
    if (providerConfig.provider !== 'iyzico') {
        if (!providerConfig.mock.enabled) {
            return errorResult('provider_not_configured')
        }

        return runLegacyMockSubscriptionCheckout({
            organizationId: input.organizationId,
            simulatedOutcome: input.simulatedOutcome,
            monthlyPriceTry: input.monthlyPriceTry,
            monthlyCredits: input.monthlyCredits
        })
    }

    if (!providerConfig.iyzico.enabled) {
        return errorResult('provider_not_configured')
    }

    if (input.simulatedOutcome === 'failed') {
        return {
            ok: false,
            status: 'failed',
            error: null,
            changeType: null,
            effectiveAt: null
        }
    }

    const { supabase, user, billing } = await loadIyzicoCheckoutContext({
        organizationId: input.organizationId
    })
    if (!user) return errorResult('unauthorized')
    if (!billing) return errorResult('request_failed')
    if (billing.lock_reason === 'admin_locked' || billing.membership_state === 'admin_locked') {
        return {
            ok: false,
            status: 'blocked',
            error: 'admin_locked'
        }
    }

    const currentCredits = Math.round(toNonNegativeNumber(billing.monthly_package_credit_limit))
    const requestedCredits = Math.round(toNonNegativeNumber(input.monthlyCredits))
    if (billing.membership_state === 'premium_active') {
        const planId = resolvePlanIdFromCredits({
            planId: input.planId,
            monthlyCredits: input.monthlyCredits
        })
        if (!planId) {
            return errorResult('invalid_input')
        }

        const pricingPlanReferenceCode = getIyzicoPlanReferenceCode(planId)
        if (!pricingPlanReferenceCode) {
            return errorResult('provider_not_configured')
        }

        const activeSubscription = await resolveActiveIyzicoSubscriptionRecord({
            tenantSupabase: supabase,
            organizationId: input.organizationId
        })
        if (!activeSubscription?.id || !activeSubscription.provider_subscription_id) {
            return errorResult('request_failed')
        }

        const serviceSupabase = createServiceRoleClient()
        if (!serviceSupabase) {
            return errorResult('request_failed')
        }

        if (requestedCredits === currentCredits) {
            return {
                ok: true,
                status: 'success',
                error: null,
                changeType: 'no_change',
                effectiveAt: null
            }
        }

        if (requestedCredits < currentCredits) {
            try {
                const scheduleResult = await upgradeIyzicoSubscription({
                    subscriptionReferenceCode: activeSubscription.provider_subscription_id,
                    newPricingPlanReferenceCode: pricingPlanReferenceCode,
                    upgradePeriod: 'NEXT_PERIOD'
                })
                const subscriptionReferenceCode = extractIyzicoSubscriptionReferenceCode(scheduleResult)
                    ?? activeSubscription.provider_subscription_id
                const { startAt } = extractIyzicoSubscriptionStartEnd(scheduleResult)
                const effectiveAt = resolveScheduledDowngradeEffectiveAt({
                    providerStartAt: startAt,
                    currentPeriodEnd: activeSubscription.period_end ?? null
                })
                const nowIso = new Date().toISOString()
                const metadata = withoutPendingPlanChange(asRecord(activeSubscription.metadata))

                await serviceSupabase
                    .from('organization_subscription_records')
                    .update({
                        provider_subscription_id: subscriptionReferenceCode,
                        metadata: {
                            ...metadata,
                            source: 'iyzico_subscription_downgrade',
                            change_type: 'downgrade',
                            requested_plan_id: planId,
                            requested_monthly_credits: requestedCredits,
                            requested_monthly_price_try: toNonNegativeNumber(input.monthlyPriceTry),
                            downgrade_scheduled_at: nowIso,
                            downgrade_schedule_response: scheduleResult,
                            pending_plan_change: {
                                change_type: 'downgrade',
                                requested_monthly_credits: requestedCredits,
                                requested_monthly_price_try: toNonNegativeNumber(input.monthlyPriceTry),
                                effective_at: effectiveAt,
                                requested_at: nowIso
                            }
                        }
                    })
                    .eq('id', activeSubscription.id)

                await serviceSupabase
                    .from('organization_billing_accounts')
                    .update({
                        last_manual_action_at: nowIso,
                        updated_at: nowIso
                    })
                    .eq('organization_id', input.organizationId)

                return {
                    ok: true,
                    status: 'scheduled',
                    error: null,
                    changeType: 'downgrade',
                    effectiveAt
                }
            } catch (error) {
                return errorResult(mapIyzicoErrorToCheckoutError(error))
            }
        }

        try {
            const upgradeResult = await upgradeIyzicoSubscription({
                subscriptionReferenceCode: activeSubscription.provider_subscription_id,
                newPricingPlanReferenceCode: pricingPlanReferenceCode,
                upgradePeriod: 'NOW',
                resetRecurrenceCount: false
            })
            const subscriptionReferenceCode = extractIyzicoSubscriptionReferenceCode(upgradeResult)
                ?? activeSubscription.provider_subscription_id
            const currentUsed = Math.round(toNonNegativeNumber(billing.monthly_package_credit_used))
            const topupBalance = toNonNegativeNumber(billing.topup_credit_balance)
            const nextPackageBalance = Math.max(0, requestedCredits - currentUsed)
            const creditDelta = Math.max(0, requestedCredits - currentCredits)
            const nowIso = new Date().toISOString()
            const metadata = withoutPendingPlanChange(asRecord(activeSubscription.metadata))
            const currentMonthlyPriceTry = toNonNegativeNumber(metadata.requested_monthly_price_try)
            const chargedAmountTry = Math.max(0, toNonNegativeNumber(input.monthlyPriceTry) - currentMonthlyPriceTry)
            const periodStart = activeSubscription.period_start ?? null
            const periodEnd = activeSubscription.period_end ?? null

            await serviceSupabase
                .from('organization_billing_accounts')
                .update({
                    membership_state: 'premium_active',
                    lock_reason: 'none',
                    monthly_package_credit_limit: requestedCredits,
                    monthly_package_credit_used: currentUsed,
                    current_period_start: periodStart,
                    current_period_end: periodEnd
                })
                .eq('organization_id', input.organizationId)

            await serviceSupabase
                .from('organization_subscription_records')
                .update({
                    provider_subscription_id: subscriptionReferenceCode,
                    period_start: periodStart,
                    period_end: periodEnd,
                    metadata: {
                        ...metadata,
                        source: 'iyzico_subscription_upgrade',
                        change_type: 'upgrade',
                        requested_plan_id: planId,
                        requested_monthly_credits: requestedCredits,
                        requested_monthly_price_try: toNonNegativeNumber(input.monthlyPriceTry),
                        upgraded_at: nowIso,
                        upgrade_response: upgradeResult
                    }
                })
                .eq('id', activeSubscription.id)

            if (creditDelta > 0) {
                await serviceSupabase
                    .from('organization_credit_ledger')
                    .insert({
                        organization_id: input.organizationId,
                        entry_type: 'package_grant',
                        credit_pool: 'package_pool',
                        credits_delta: creditDelta,
                        balance_after: nextPackageBalance + topupBalance,
                        reason: 'Iyzico subscription upgrade success',
                        metadata: {
                            source: 'iyzico_subscription_upgrade',
                            subscription_id: activeSubscription.id,
                            requested_monthly_credits: requestedCredits,
                            requested_monthly_price_try: toNonNegativeNumber(input.monthlyPriceTry),
                            charged_amount_try: chargedAmountTry,
                            change_type: 'upgrade'
                        }
                    })
            }

            return {
                ok: true,
                status: 'success',
                error: null,
                changeType: 'upgrade',
                effectiveAt: null
            }
        } catch (error) {
            return errorResult(mapIyzicoErrorToCheckoutError(error))
        }
    }

    const planId = resolvePlanIdFromCredits({
        planId: input.planId,
        monthlyCredits: input.monthlyCredits
    })
    if (!planId) {
        return errorResult('invalid_input')
    }

    const pricingPlanReferenceCode = getIyzicoPlanReferenceCode(planId)
    if (!pricingPlanReferenceCode) {
        return errorResult('provider_not_configured')
    }

    const callbackUrl = resolveCheckoutCallbackUrl({
        action: 'subscribe',
        callbackUrl: input.callbackUrl,
        locale: input.locale
    })
    if (!callbackUrl) {
        return errorResult('request_failed')
    }

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase) {
        return errorResult('request_failed')
    }

    const { profile, organization, billingProfile } = await resolveProfileAndOrganization({
        tenantSupabase: supabase,
        userId: user.id,
        organizationId: input.organizationId
    })
    const nameParts = splitNameParts(profile?.full_name)
    const contactName = billingProfile?.company_name?.trim()
        || organization?.name?.trim()
        || `${nameParts.name} ${nameParts.surname}`.trim()
    const defaultEmail = billingProfile?.billing_email?.trim() || profile?.email?.trim() || 'billing@example.com'
    const defaultAddress = billingProfile?.address_line_1?.trim()
        || process.env.IYZICO_DEFAULT_ADDRESS?.trim()
        || 'Nidakule Goztepe, Merdivenkoy Mah. Bora Sok. No:1'
    const defaultCity = billingProfile?.city?.trim() || process.env.IYZICO_DEFAULT_CITY?.trim() || 'Istanbul'
    const defaultCountry = billingProfile?.country?.trim() || process.env.IYZICO_DEFAULT_COUNTRY?.trim() || 'Turkey'
    const defaultZipCode = billingProfile?.postal_code?.trim() || process.env.IYZICO_DEFAULT_ZIP_CODE?.trim() || '34742'
    const defaultIdentity = billingProfile?.tax_identity_number?.trim()
        || process.env.IYZICO_DEFAULT_IDENTITY_NUMBER?.trim()
        || '11111111111'
    const defaultGsm = billingProfile?.billing_phone?.trim()
        || process.env.IYZICO_DEFAULT_GSM_NUMBER?.trim()
        || '+905555555555'
    const now = new Date().toISOString()

    const pendingInsert = await serviceSupabase
        .from('organization_subscription_records')
        .insert({
            organization_id: input.organizationId,
            provider: 'iyzico',
            provider_subscription_id: null,
            status: 'pending',
            period_start: null,
            period_end: null,
            metadata: {
                source: 'iyzico_checkout_form',
                checkout_locale: resolveRouteLocale(input.locale),
                callback_url: callbackUrl,
                requested_monthly_price_try: toNonNegativeNumber(input.monthlyPriceTry),
                requested_monthly_credits: toNonNegativeNumber(input.monthlyCredits),
                requested_plan_id: planId,
                initiated_by: user.id,
                initiated_at: now
            }
        })
        .select('id, metadata')
        .maybeSingle()

    if (pendingInsert.error || !pendingInsert.data?.id) {
        console.error('Failed to create pending iyzico subscription row:', pendingInsert.error)
        return errorResult('request_failed')
    }

    const pendingId = pendingInsert.data.id

    try {
        const checkoutResult = await initializeIyzicoSubscriptionCheckout({
            locale: resolveIyzicoLocale(input.locale),
            conversationId: pendingId,
            callbackUrl,
            pricingPlanReferenceCode,
            customer: {
                name: nameParts.name,
                surname: nameParts.surname,
                identityNumber: defaultIdentity,
                email: defaultEmail,
                gsmNumber: defaultGsm,
                billingAddress: {
                    contactName,
                    city: defaultCity,
                    country: defaultCountry,
                    address: defaultAddress,
                    zipCode: defaultZipCode
                },
                shippingAddress: {
                    contactName,
                    city: defaultCity,
                    country: defaultCountry,
                    address: defaultAddress,
                    zipCode: defaultZipCode
                }
            }
        })

        const token = typeof checkoutResult.token === 'string'
            ? checkoutResult.token.trim()
            : ''
        const checkoutFormContent = typeof checkoutResult.checkoutFormContent === 'string'
            ? checkoutResult.checkoutFormContent
            : ''

        if (!token || !checkoutFormContent) {
            await serviceSupabase
                .from('organization_subscription_records')
                .update({
                    status: 'incomplete',
                    metadata: {
                        ...asRecord(pendingInsert.data.metadata),
                        checkout_error: 'missing_checkout_form_payload',
                        updated_at: new Date().toISOString()
                    }
                })
                .eq('id', pendingId)

            return errorResult('request_failed')
        }

        await serviceSupabase
            .from('organization_subscription_records')
            .update({
                metadata: {
                    ...asRecord(pendingInsert.data.metadata),
                    organization_name: organization?.name ?? null,
                    checkout_token: token,
                    checkout_form_content: checkoutFormContent,
                    checkout_initialize_response: checkoutResult
                }
            })
            .eq('id', pendingId)

        return {
            ok: true,
            status: 'redirect',
            error: null,
            changeType: 'start',
            effectiveAt: null,
            redirectUrl: buildLocalizedPath(`/settings/plans/subscription-checkout/${pendingId}`, input.locale)
        }
    } catch (error) {
        await serviceSupabase
            .from('organization_subscription_records')
            .update({
                status: 'incomplete',
                metadata: {
                    ...asRecord(pendingInsert.data.metadata),
                    checkout_error: toErrorMessage(error),
                    updated_at: new Date().toISOString()
                }
            })
            .eq('id', pendingId)

        return errorResult(mapIyzicoErrorToCheckoutError(error))
    }
}

export async function simulateMockTopupCheckout(input: {
    organizationId: string
    simulatedOutcome: MockPaymentOutcome
    credits: number
    amountTry: number
    callbackUrl?: string | null
    locale?: string | null
    customerIp?: string | null
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

    const providerConfig = getBillingProviderConfig()
    if (providerConfig.provider !== 'iyzico') {
        if (!providerConfig.mock.enabled) {
            return errorResult('provider_not_configured')
        }

        return runLegacyMockTopupCheckout({
            organizationId: input.organizationId,
            simulatedOutcome: input.simulatedOutcome,
            credits: input.credits,
            amountTry: input.amountTry
        })
    }

    if (!providerConfig.iyzico.enabled) {
        return errorResult('provider_not_configured')
    }

    if (input.simulatedOutcome === 'failed') {
        return {
            ok: false,
            status: 'failed',
            error: null,
            changeType: null,
            effectiveAt: null
        }
    }

    const { supabase, user, billing } = await loadIyzicoCheckoutContext({
        organizationId: input.organizationId
    })
    if (!user) return errorResult('unauthorized')
    if (!billing) return errorResult('request_failed')
    if (billing.lock_reason === 'admin_locked' || billing.membership_state === 'admin_locked') {
        return {
            ok: false,
            status: 'blocked',
            error: 'admin_locked'
        }
    }

    if (billing.membership_state !== 'premium_active') {
        return {
            ok: false,
            status: 'blocked',
            error: 'topup_not_allowed'
        }
    }

    const callbackUrl = resolveCheckoutCallbackUrl({
        action: 'topup',
        callbackUrl: input.callbackUrl,
        locale: input.locale
    })
    if (!callbackUrl) {
        return errorResult('request_failed')
    }

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase) {
        return errorResult('request_failed')
    }

    const { profile, organization, billingProfile } = await resolveProfileAndOrganization({
        tenantSupabase: supabase,
        userId: user.id,
        organizationId: input.organizationId
    })
    const nameParts = splitNameParts(profile?.full_name)
    const contactName = billingProfile?.company_name?.trim()
        || organization?.name?.trim()
        || `${nameParts.name} ${nameParts.surname}`.trim()
    const now = new Date()
    const nowFormatted = formatIyzicoDate(now)
    const defaultEmail = billingProfile?.billing_email?.trim() || profile?.email?.trim() || 'billing@example.com'
    const defaultAddress = billingProfile?.address_line_1?.trim()
        || process.env.IYZICO_DEFAULT_ADDRESS?.trim()
        || 'Nidakule Goztepe, Merdivenkoy Mah. Bora Sok. No:1'
    const defaultCity = billingProfile?.city?.trim() || process.env.IYZICO_DEFAULT_CITY?.trim() || 'Istanbul'
    const defaultCountry = billingProfile?.country?.trim() || process.env.IYZICO_DEFAULT_COUNTRY?.trim() || 'Turkey'
    const defaultZipCode = billingProfile?.postal_code?.trim() || process.env.IYZICO_DEFAULT_ZIP_CODE?.trim() || '34742'
    const defaultIdentity = billingProfile?.tax_identity_number?.trim()
        || process.env.IYZICO_DEFAULT_IDENTITY_NUMBER?.trim()
        || '11111111111'
    const defaultGsm = billingProfile?.billing_phone?.trim()
        || process.env.IYZICO_DEFAULT_GSM_NUMBER?.trim()
        || '+905555555555'
    const ipAddress = input.customerIp?.trim() || process.env.IYZICO_DEFAULT_IP?.trim() || '127.0.0.1'

    const pendingOrderInsert = await serviceSupabase
        .from('credit_purchase_orders')
        .insert({
            organization_id: input.organizationId,
            provider: 'iyzico',
            provider_checkout_id: null,
            provider_payment_id: null,
            status: 'pending',
            credits: toNonNegativeNumber(input.credits),
            amount_try: toNonNegativeNumber(input.amountTry),
            currency: 'TRY',
            paid_at: null,
            metadata: {
                source: 'iyzico_checkout_form',
                checkout_locale: resolveRouteLocale(input.locale),
                callback_url: callbackUrl,
                initiated_by: user.id,
                initiated_at: now.toISOString()
            }
        })
        .select('id, metadata')
        .maybeSingle()

    if (pendingOrderInsert.error || !pendingOrderInsert.data?.id) {
        console.error('Failed to create pending iyzico top-up order:', pendingOrderInsert.error)
        return errorResult('request_failed')
    }

    const orderId = pendingOrderInsert.data.id

    try {
        const checkoutResult = await initializeIyzicoTopupCheckout({
            locale: resolveIyzicoLocale(input.locale),
            conversationId: orderId,
            callbackUrl,
            price: toNonNegativeNumber(input.amountTry),
            paidPrice: toNonNegativeNumber(input.amountTry),
            currency: 'TRY',
            basketId: `topup_${orderId}`,
            buyer: {
                id: user.id,
                name: nameParts.name,
                surname: nameParts.surname,
                identityNumber: defaultIdentity,
                email: defaultEmail,
                gsmNumber: defaultGsm,
                registrationDate: nowFormatted,
                lastLoginDate: nowFormatted,
                registrationAddress: defaultAddress,
                ip: ipAddress,
                city: defaultCity,
                country: defaultCountry,
                zipCode: defaultZipCode
            },
            shippingAddress: {
                contactName,
                city: defaultCity,
                country: defaultCountry,
                address: defaultAddress,
                zipCode: defaultZipCode
            },
            billingAddress: {
                contactName,
                city: defaultCity,
                country: defaultCountry,
                address: defaultAddress,
                zipCode: defaultZipCode
            },
            basketItems: [
                {
                    id: `topup_pack_${Math.round(toNonNegativeNumber(input.credits))}`,
                    name: 'Qualy AI Top-up Credits',
                    category1: 'SaaS',
                    category2: 'Credit Topup',
                    itemType: 'VIRTUAL',
                    price: toNonNegativeNumber(input.amountTry)
                }
            ]
        })

        const checkoutToken = typeof checkoutResult.token === 'string'
            ? checkoutResult.token.trim()
            : ''
        const checkoutFormContent = typeof checkoutResult.checkoutFormContent === 'string'
            ? checkoutResult.checkoutFormContent
            : ''
        const paymentPageUrl = typeof checkoutResult.paymentPageUrl === 'string'
            ? checkoutResult.paymentPageUrl.trim()
            : ''
        if (!checkoutToken || !checkoutFormContent) {
            await serviceSupabase
                .from('credit_purchase_orders')
                .update({
                    status: 'failed',
                    metadata: {
                        ...asRecord(pendingOrderInsert.data.metadata),
                        checkout_error: 'missing_checkout_page_url_or_token',
                        checkout_initialize_response: checkoutResult
                    }
                })
                .eq('id', orderId)

            return errorResult('request_failed')
        }

        await serviceSupabase
            .from('credit_purchase_orders')
            .update({
                provider_checkout_id: checkoutToken,
                metadata: {
                    ...asRecord(pendingOrderInsert.data.metadata),
                    checkout_token: checkoutToken,
                    checkout_form_content: checkoutFormContent,
                    checkout_page_url: paymentPageUrl,
                    checkout_initialize_response: checkoutResult
                }
            })
            .eq('id', orderId)

        return {
            ok: true,
            status: 'redirect',
            error: null,
            changeType: null,
            effectiveAt: null,
            redirectUrl: buildLocalizedPath(`/settings/plans/topup-checkout/${orderId}`, input.locale)
        }
    } catch (error) {
        await serviceSupabase
            .from('credit_purchase_orders')
            .update({
                status: 'failed',
                metadata: {
                    ...asRecord(pendingOrderInsert.data.metadata),
                    checkout_error: toErrorMessage(error)
                }
            })
            .eq('id', orderId)

        return errorResult(mapIyzicoErrorToCheckoutError(error))
    }
}
