import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
    retrieveIyzicoSubscriptionCheckoutResult,
    retrieveIyzicoTopupCheckoutResult,
    upgradeIyzicoSubscription
} from '@/lib/billing/providers/iyzico/client'
import {
    extractIyzicoCheckoutPaymentConversationId,
    extractIyzicoSubscriptionReferenceCode,
    extractIyzicoSubscriptionStartEnd
} from '@/lib/billing/providers/iyzico/checkout-result'
import { mapIyzicoProviderFailureToCheckoutError } from '@/lib/billing/providers/iyzico/error-map'
import { resolvePremiumActivationBalances } from '@/lib/billing/premium-activation'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'

export const runtime = 'nodejs'

interface CreditPurchaseOrderRow {
    id: string
    organization_id: string
    status: string
    credits: number
    amount_try: number
    metadata: unknown
}

interface SubscriptionRecordRow {
    id: string
    organization_id: string
    status: string
    metadata: unknown
    provider_subscription_id: string | null
}

interface BillingAccountRow {
    organization_id: string
    trial_credit_limit: number
    trial_credit_used: number
    monthly_package_credit_limit: number
    monthly_package_credit_used: number
    topup_credit_balance: number
    premium_assigned_at: string | null
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function toNonNegativeNumber(value: unknown) {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
}

function readString(record: Record<string, unknown>, key: string) {
    const value = record[key]
    return typeof value === 'string' && value.trim().length > 0
        ? value.trim()
        : null
}

function readRecord(record: Record<string, unknown>, key: string) {
    const value = record[key]
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function resolveLocale(value: unknown): 'tr' | 'en' {
    return typeof value === 'string' && value.toLowerCase().startsWith('en')
        ? 'en'
        : 'tr'
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

function buildPlansRedirectUrl(input: {
    req: NextRequest
    locale: 'tr' | 'en'
    action: 'subscribe' | 'topup'
    status: 'success' | 'scheduled' | 'failed' | 'blocked' | 'error'
    error?: string | null
    changeType?: string | null
    effectiveAt?: string | null
}) {
    const query = new URLSearchParams()
    query.set('checkout_action', input.action)
    query.set('checkout_status', input.status)
    if (input.error) query.set('checkout_error', input.error)
    if (input.changeType) query.set('checkout_change_type', input.changeType)
    if (input.effectiveAt) query.set('checkout_effective_at', input.effectiveAt)
    const target = `${buildLocalizedPath('/settings/plans', input.locale)}?${query.toString()}`
    return new URL(target, input.req.nextUrl.origin)
}

function resolveTokenFromSearchParams(req: NextRequest) {
    const token = req.nextUrl.searchParams.get('token') || req.nextUrl.searchParams.get('checkoutFormToken')
    if (!token) return null
    const trimmed = token.trim()
    return trimmed.length > 0 ? trimmed : null
}

async function resolveTokenFromBody(req: NextRequest) {
    const contentType = req.headers.get('content-type')?.toLowerCase() ?? ''
    if (contentType.includes('application/json')) {
        try {
            const payload = await req.json()
            const record = asRecord(payload)
            const token = record.token
            if (typeof token === 'string' && token.trim()) return token.trim()
            const checkoutFormToken = record.checkoutFormToken
            if (typeof checkoutFormToken === 'string' && checkoutFormToken.trim()) return checkoutFormToken.trim()
        } catch {
            return null
        }
    }

    if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
        try {
            const formData = await req.formData()
            const token = String(formData.get('token') ?? '').trim()
            if (token) return token
            const checkoutFormToken = String(formData.get('checkoutFormToken') ?? '').trim()
            if (checkoutFormToken) return checkoutFormToken
        } catch {
            return null
        }
    }

    return null
}

async function findTopupOrderByToken(serviceSupabase: ReturnType<typeof createServiceRoleClient>, token: string) {
    if (!serviceSupabase) return null

    const { data, error } = await serviceSupabase
        .from('credit_purchase_orders')
        .select('id, organization_id, status, credits, amount_try, metadata')
        .eq('provider', 'iyzico')
        .eq('metadata->>checkout_token', token)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !data) return null
    return data as CreditPurchaseOrderRow
}

async function findSubscriptionRecordByToken(serviceSupabase: ReturnType<typeof createServiceRoleClient>, token: string) {
    if (!serviceSupabase) return null

    const { data, error } = await serviceSupabase
        .from('organization_subscription_records')
        .select('id, organization_id, status, metadata, provider_subscription_id')
        .eq('provider', 'iyzico')
        .eq('metadata->>checkout_token', token)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !data) return null
    return data as SubscriptionRecordRow
}

function resolveOrderCheckoutRedirectContext(order: CreditPurchaseOrderRow) {
    const metadata = asRecord(order.metadata)
    const action: 'subscribe' | 'topup' = readString(metadata, 'checkout_action') === 'subscribe'
        ? 'subscribe'
        : 'topup'

    return {
        action,
        changeType: readString(metadata, 'change_type')
    }
}

async function processTopupCallback(input: {
    req: NextRequest
    serviceSupabase: ReturnType<typeof createServiceRoleClient>
    token: string
    order: CreditPurchaseOrderRow
    locale: 'tr' | 'en'
}) {
    const redirectContext = resolveOrderCheckoutRedirectContext(input.order)
    const orderMetadata = asRecord(input.order.metadata)
    const isUpgradeCheckout = readString(orderMetadata, 'source') === 'iyzico_subscription_upgrade_checkout'

    if (!input.serviceSupabase) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: redirectContext.action,
            status: 'error',
            error: 'request_failed'
        }))
    }

    if (input.order.status === 'paid') {
        if (isUpgradeCheckout && readString(orderMetadata, 'upgrade_apply_status') !== 'success') {
            return NextResponse.redirect(buildPlansRedirectUrl({
                req: input.req,
                locale: input.locale,
                action: redirectContext.action,
                status: 'error',
                changeType: redirectContext.changeType,
                error: 'request_failed'
            }))
        }

        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: redirectContext.action,
            status: 'success',
            changeType: redirectContext.changeType
        }))
    }

    const persistedScheduleResponse = readRecord(orderMetadata, 'upgrade_schedule_response')
    const persistedPaymentStatus = readString(orderMetadata, 'payment_status')?.toUpperCase() ?? ''
    const persistedPaymentId = readString(orderMetadata, 'payment_id')
    const persistedPaymentConversationId = readString(orderMetadata, 'payment_conversation_id')
    const persistedCallbackResponse = readRecord(orderMetadata, 'callback_retrieve_response')
    const canReusePersistedUpgradePayment = Boolean(
        isUpgradeCheckout
        && persistedScheduleResponse
        && persistedPaymentStatus === 'SUCCESS'
        && persistedPaymentId
    )

    let checkoutResult: unknown = persistedCallbackResponse
        ?? {
            paymentStatus: persistedPaymentStatus,
            paymentId: persistedPaymentId,
            paymentConversationId: persistedPaymentConversationId
        }
    let paymentStatus = persistedPaymentStatus
    let paymentId = persistedPaymentId ?? input.token
    let paymentConversationId = persistedPaymentConversationId

    if (!canReusePersistedUpgradePayment) {
        const conversationId = input.order.id
        try {
            checkoutResult = await retrieveIyzicoTopupCheckoutResult(input.token, conversationId)
        } catch (error) {
            await input.serviceSupabase
                .from('credit_purchase_orders')
                .update({
                    status: 'failed',
                    metadata: {
                        ...orderMetadata,
                        callback_token: input.token,
                        callback_processed_at: new Date().toISOString(),
                        callback_error: error instanceof Error ? error.message : 'Unknown iyzico callback error'
                    }
                })
                .eq('id', input.order.id)

            return NextResponse.redirect(buildPlansRedirectUrl({
                req: input.req,
                locale: input.locale,
                action: redirectContext.action,
                status: 'failed',
                changeType: redirectContext.changeType,
                error: mapIyzicoProviderFailureToCheckoutError(error) ?? 'request_failed'
            }))
        }

        paymentStatus = typeof asRecord(checkoutResult).paymentStatus === 'string'
            ? String(asRecord(checkoutResult).paymentStatus).toUpperCase()
            : ''

        if (paymentStatus !== 'SUCCESS') {
            await input.serviceSupabase
                .from('credit_purchase_orders')
                .update({
                    status: 'failed',
                    metadata: {
                        ...orderMetadata,
                        callback_token: input.token,
                        callback_processed_at: new Date().toISOString(),
                        callback_retrieve_response: checkoutResult
                    }
                })
                .eq('id', input.order.id)

            return NextResponse.redirect(buildPlansRedirectUrl({
                req: input.req,
                locale: input.locale,
                action: redirectContext.action,
                status: 'failed',
                changeType: redirectContext.changeType,
                error: mapIyzicoProviderFailureToCheckoutError(checkoutResult) ?? null
            }))
        }

        paymentId = typeof asRecord(checkoutResult).paymentId === 'string' && String(asRecord(checkoutResult).paymentId).trim()
            ? String(asRecord(checkoutResult).paymentId).trim()
            : typeof asRecord(checkoutResult).iyziReferenceCode === 'string' && String(asRecord(checkoutResult).iyziReferenceCode).trim()
                ? String(asRecord(checkoutResult).iyziReferenceCode).trim()
                : input.token
        paymentConversationId = extractIyzicoCheckoutPaymentConversationId(checkoutResult)
    }

    const nowIso = new Date().toISOString()

    if (isUpgradeCheckout) {
        const subscriptionId = readString(orderMetadata, 'subscription_id')
        const subscriptionReferenceCode = readString(orderMetadata, 'subscription_reference_code')
        const targetPricingPlanReferenceCode = readString(orderMetadata, 'target_pricing_plan_reference_code')
        const requestedPlanId = readString(orderMetadata, 'requested_plan_id')
        const requestedCredits = Math.round(toNonNegativeNumber(orderMetadata.requested_monthly_credits))
        const requestedPriceTry = toNonNegativeNumber(orderMetadata.requested_monthly_price_try)
        const creditDelta = Math.max(
            0,
            Math.round(toNonNegativeNumber(orderMetadata.credit_delta) || toNonNegativeNumber(input.order.credits))
        )
        const conversationId = readString(orderMetadata, 'conversation_id')
            ?? (subscriptionId && requestedPlanId ? `subscription_change_${subscriptionId}_${requestedPlanId}` : null)

        if (
            !subscriptionId
            || !subscriptionReferenceCode
            || !targetPricingPlanReferenceCode
            || !requestedPlanId
            || !conversationId
            || requestedCredits <= 0
            || requestedPriceTry <= 0
            || creditDelta <= 0
        ) {
            await input.serviceSupabase
                .from('credit_purchase_orders')
                .update({
                    provider_payment_id: paymentId,
                    paid_at: nowIso,
                    metadata: {
                        ...orderMetadata,
                        callback_token: input.token,
                        callback_processed_at: nowIso,
                        payment_status: paymentStatus,
                        payment_id: paymentId,
                        payment_conversation_id: paymentConversationId,
                        callback_retrieve_response: checkoutResult,
                        upgrade_apply_status: 'failed',
                        upgrade_apply_error: 'missing_upgrade_metadata'
                    }
                })
                .eq('id', input.order.id)

            return NextResponse.redirect(buildPlansRedirectUrl({
                req: input.req,
                locale: input.locale,
                action: redirectContext.action,
                status: 'error',
                changeType: redirectContext.changeType,
                error: 'request_failed'
            }))
        }

        let latestOrderMetadata = orderMetadata
        let scheduleResult = persistedScheduleResponse

        if (!scheduleResult) {
            let providerScheduleResult: Awaited<ReturnType<typeof upgradeIyzicoSubscription>>
            try {
                providerScheduleResult = await upgradeIyzicoSubscription({
                    conversationId,
                    subscriptionReferenceCode,
                    newPricingPlanReferenceCode: targetPricingPlanReferenceCode,
                    upgradePeriod: 'NEXT_PERIOD',
                    resetRecurrenceCount: false
                })
            } catch (error) {
                await input.serviceSupabase
                    .from('credit_purchase_orders')
                    .update({
                        provider_payment_id: paymentId,
                        paid_at: nowIso,
                        metadata: {
                            ...orderMetadata,
                            callback_token: input.token,
                            callback_processed_at: nowIso,
                            payment_status: paymentStatus,
                            payment_id: paymentId,
                            payment_conversation_id: paymentConversationId,
                            callback_retrieve_response: checkoutResult,
                            upgrade_apply_status: 'failed',
                            upgrade_apply_error: error instanceof Error ? error.message : 'upgrade scheduling failed'
                        }
                    })
                    .eq('id', input.order.id)

                return NextResponse.redirect(buildPlansRedirectUrl({
                    req: input.req,
                    locale: input.locale,
                    action: redirectContext.action,
                    status: 'error',
                    changeType: redirectContext.changeType,
                    error: 'request_failed'
                }))
            }

            scheduleResult = asRecord(providerScheduleResult)
            latestOrderMetadata = {
                ...orderMetadata,
                callback_token: input.token,
                callback_processed_at: nowIso,
                payment_status: paymentStatus,
                payment_id: paymentId,
                payment_conversation_id: paymentConversationId,
                callback_retrieve_response: checkoutResult,
                upgrade_apply_status: 'scheduled',
                upgrade_schedule_response: providerScheduleResult
            }

            const schedulePersistResult = await input.serviceSupabase
                .from('credit_purchase_orders')
                .update({
                    provider_payment_id: paymentId,
                    paid_at: nowIso,
                    metadata: latestOrderMetadata
                })
                .eq('id', input.order.id)

            if (schedulePersistResult.error) {
                return NextResponse.redirect(buildPlansRedirectUrl({
                    req: input.req,
                    locale: input.locale,
                    action: redirectContext.action,
                    status: 'error',
                    changeType: redirectContext.changeType,
                    error: 'request_failed'
                }))
            }
        }

        const nextSubscriptionReferenceCode = extractIyzicoSubscriptionReferenceCode(scheduleResult) ?? subscriptionReferenceCode
        const applyResult = await input.serviceSupabase.rpc('apply_iyzico_subscription_upgrade_checkout_success', {
            target_order_id: input.order.id,
            next_subscription_reference_code: nextSubscriptionReferenceCode,
            payment_conversation_id: paymentConversationId,
            upgrade_schedule_response: scheduleResult,
            callback_retrieve_response: checkoutResult,
            applied_at: nowIso
        })

        const applyResultRecord = asRecord(applyResult.data)
        if (applyResult.error || applyResultRecord.ok !== true) {
            await input.serviceSupabase
                .from('credit_purchase_orders')
                .update({
                    provider_payment_id: paymentId,
                    paid_at: nowIso,
                    metadata: {
                        ...latestOrderMetadata,
                        upgrade_apply_status: 'failed',
                        upgrade_apply_error: applyResult.error?.message ?? 'upgrade apply failed'
                    }
                })
                .eq('id', input.order.id)

            return NextResponse.redirect(buildPlansRedirectUrl({
                req: input.req,
                locale: input.locale,
                action: redirectContext.action,
                status: 'error',
                changeType: redirectContext.changeType,
                error: 'request_failed'
            }))
        }

        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: redirectContext.action,
            status: 'success',
            changeType: redirectContext.changeType
        }))
    }

    const { data: billingAccount, error: billingError } = await input.serviceSupabase
        .from('organization_billing_accounts')
        .select('organization_id, monthly_package_credit_limit, monthly_package_credit_used, topup_credit_balance, premium_assigned_at')
        .eq('organization_id', input.order.organization_id)
        .maybeSingle()

    if (billingError || !billingAccount) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: redirectContext.action,
            status: 'error',
            error: 'request_failed'
        }))
    }

    const billing = billingAccount as BillingAccountRow
    const credits = toNonNegativeNumber(input.order.credits)
    const currentTopup = toNonNegativeNumber(billing.topup_credit_balance)
    const nextTopup = currentTopup + credits
    const remainingPackage = Math.max(
        0,
        toNonNegativeNumber(billing.monthly_package_credit_limit) - toNonNegativeNumber(billing.monthly_package_credit_used)
    )

    await input.serviceSupabase
        .from('organization_billing_accounts')
        .update({
            topup_credit_balance: nextTopup,
            lock_reason: 'none'
        })
        .eq('organization_id', input.order.organization_id)

    await input.serviceSupabase
        .from('credit_purchase_orders')
        .update({
            status: 'paid',
            provider_payment_id: paymentId,
            paid_at: nowIso,
            metadata: {
                ...orderMetadata,
                callback_token: input.token,
                callback_processed_at: nowIso,
                payment_status: paymentStatus,
                payment_id: paymentId,
                payment_conversation_id: paymentConversationId,
                callback_retrieve_response: checkoutResult
            }
        })
        .eq('id', input.order.id)

    await input.serviceSupabase
        .from('organization_credit_ledger')
        .insert({
            organization_id: input.order.organization_id,
            entry_type: 'purchase_credit',
            credit_pool: 'topup_pool',
            credits_delta: credits,
            balance_after: remainingPackage + nextTopup,
            reason: 'Iyzico top-up checkout success',
            metadata: {
                source: 'iyzico_checkout_form',
                order_id: input.order.id,
                payment_id: paymentId
            }
        })

    return NextResponse.redirect(buildPlansRedirectUrl({
        req: input.req,
        locale: input.locale,
        action: redirectContext.action,
        status: 'success',
        changeType: redirectContext.changeType
    }))
}

async function processSubscriptionCallback(input: {
    req: NextRequest
    serviceSupabase: ReturnType<typeof createServiceRoleClient>
    token: string
    subscriptionRecord: SubscriptionRecordRow
    locale: 'tr' | 'en'
}) {
    if (!input.serviceSupabase) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'subscribe',
            status: 'error',
            error: 'request_failed'
        }))
    }

    if (input.subscriptionRecord.status === 'active') {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'subscribe',
            status: 'success'
        }))
    }

    let checkoutResult: Awaited<ReturnType<typeof retrieveIyzicoSubscriptionCheckoutResult>>
    try {
        checkoutResult = await retrieveIyzicoSubscriptionCheckoutResult(input.token)
    } catch (error) {
        await input.serviceSupabase
            .from('organization_subscription_records')
            .update({
                status: 'incomplete',
                metadata: {
                    ...asRecord(input.subscriptionRecord.metadata),
                    callback_token: input.token,
                    callback_processed_at: new Date().toISOString(),
                    callback_error: error instanceof Error ? error.message : 'Unknown iyzico callback error'
                }
            })
            .eq('id', input.subscriptionRecord.id)

        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'subscribe',
            status: 'failed',
            error: mapIyzicoProviderFailureToCheckoutError(error) ?? 'request_failed'
        }))
    }
    const resultRecord = asRecord(checkoutResult)
    const data = asRecord(resultRecord.data)
    const subscriptionStatus = typeof data.subscriptionStatus === 'string'
        ? data.subscriptionStatus.toUpperCase()
        : ''
    const metadataRecord = asRecord(input.subscriptionRecord.metadata)

    if (subscriptionStatus !== 'ACTIVE' && subscriptionStatus !== 'UPGRADED') {
        await input.serviceSupabase
            .from('organization_subscription_records')
            .update({
                status: 'incomplete',
                metadata: {
                    ...metadataRecord,
                    callback_token: input.token,
                    callback_processed_at: new Date().toISOString(),
                    callback_retrieve_response: checkoutResult
                }
            })
            .eq('id', input.subscriptionRecord.id)

        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'subscribe',
            status: 'failed',
            error: mapIyzicoProviderFailureToCheckoutError(checkoutResult) ?? null
        }))
    }

    const subscriptionReferenceCode = extractIyzicoSubscriptionReferenceCode(checkoutResult)
        ?? input.subscriptionRecord.provider_subscription_id
    const { startAt, endAt } = extractIyzicoSubscriptionStartEnd(checkoutResult)
    const nowIso = new Date().toISOString()
    const periodStart = startAt ?? nowIso
    const periodEnd = endAt ?? new Date(Date.now() + (30 * 24 * 60 * 60 * 1000)).toISOString()
    const requestedCredits = toNonNegativeNumber(metadataRecord.requested_monthly_credits)
    const requestedPriceTry = toNonNegativeNumber(metadataRecord.requested_monthly_price_try)

    const { data: billingAccount, error: billingError } = await input.serviceSupabase
        .from('organization_billing_accounts')
        .select('organization_id, trial_credit_limit, trial_credit_used, monthly_package_credit_limit, monthly_package_credit_used, topup_credit_balance, premium_assigned_at')
        .eq('organization_id', input.subscriptionRecord.organization_id)
        .maybeSingle()

    if (billingError || !billingAccount) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'subscribe',
            status: 'error',
            error: 'request_failed'
        }))
    }

    const billing = billingAccount as BillingAccountRow
    const {
        carryoverTrialCredits,
        nextTrialCreditUsed,
        nextTopupCreditBalance,
        totalRemainingCreditsAfterActivation
    } = resolvePremiumActivationBalances({
        trialCreditLimit: toNonNegativeNumber(billing.trial_credit_limit),
        trialCreditUsed: toNonNegativeNumber(billing.trial_credit_used),
        topupCreditBalance: toNonNegativeNumber(billing.topup_credit_balance),
        requestedPackageCredits: requestedCredits
    })

    await input.serviceSupabase
        .from('organization_billing_accounts')
        .update({
            membership_state: 'premium_active',
            lock_reason: 'none',
            current_period_start: periodStart,
            current_period_end: periodEnd,
            trial_credit_used: nextTrialCreditUsed,
            monthly_package_credit_limit: requestedCredits,
            monthly_package_credit_used: 0,
            topup_credit_balance: nextTopupCreditBalance,
            premium_assigned_at: billing.premium_assigned_at ?? nowIso
        })
        .eq('organization_id', input.subscriptionRecord.organization_id)

    await input.serviceSupabase
        .from('organization_subscription_records')
        .update({
            status: 'active',
            provider_subscription_id: subscriptionReferenceCode,
            period_start: periodStart,
            period_end: periodEnd,
            metadata: {
                ...metadataRecord,
                callback_token: input.token,
                callback_processed_at: nowIso,
                checkout_form_content: null,
                callback_retrieve_response: checkoutResult
            }
        })
        .eq('id', input.subscriptionRecord.id)

    const { data: existingLedger } = await input.serviceSupabase
        .from('organization_credit_ledger')
        .select('id')
        .eq('organization_id', input.subscriptionRecord.organization_id)
        .eq('entry_type', 'package_grant')
        .eq('metadata->>subscription_record_id', input.subscriptionRecord.id)
        .limit(1)
        .maybeSingle()

    if (!existingLedger?.id) {
        if (carryoverTrialCredits > 0) {
            await input.serviceSupabase
                .from('organization_credit_ledger')
                .insert({
                    organization_id: input.subscriptionRecord.organization_id,
                    entry_type: 'adjustment',
                    credit_pool: 'topup_pool',
                    credits_delta: carryoverTrialCredits,
                    balance_after: totalRemainingCreditsAfterActivation,
                    reason: 'Trial credit carryover on premium activation',
                    metadata: {
                        source: 'trial_credit_carryover',
                        subscription_record_id: input.subscriptionRecord.id
                    }
                })
        }

        await input.serviceSupabase
            .from('organization_credit_ledger')
            .insert({
                organization_id: input.subscriptionRecord.organization_id,
                entry_type: 'package_grant',
                credit_pool: 'package_pool',
                credits_delta: requestedCredits,
                balance_after: totalRemainingCreditsAfterActivation,
                reason: 'Iyzico subscription checkout success',
                metadata: {
                    source: 'iyzico_subscription_checkout_form',
                    subscription_record_id: input.subscriptionRecord.id,
                    requested_monthly_price_try: requestedPriceTry
                }
            })
    }

    return NextResponse.redirect(buildPlansRedirectUrl({
        req: input.req,
        locale: input.locale,
        action: 'subscribe',
        status: 'success'
    }))
}

async function handleCallback(req: NextRequest, bodyToken: string | null = null) {
    const token = bodyToken ?? resolveTokenFromSearchParams(req)
    const queryAction = req.nextUrl.searchParams.get('action')
    const queryLocale = resolveLocale(req.nextUrl.searchParams.get('locale'))

    if (!token) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req,
            locale: queryLocale,
            action: queryAction === 'topup' ? 'topup' : 'subscribe',
            status: 'error',
            error: 'invalid_input'
        }))
    }

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req,
            locale: queryLocale,
            action: queryAction === 'topup' ? 'topup' : 'subscribe',
            status: 'error',
            error: 'request_failed'
        }))
    }

    const order = await findTopupOrderByToken(serviceSupabase, token)
    if (order) {
        const localeFromOrder = resolveLocale(asRecord(order.metadata).checkout_locale)
        return processTopupCallback({
            req,
            serviceSupabase,
            token,
            order,
            locale: localeFromOrder
        })
    }

    const subscriptionRecord = await findSubscriptionRecordByToken(serviceSupabase, token)
    if (subscriptionRecord) {
        const localeFromSubscription = resolveLocale(asRecord(subscriptionRecord.metadata).checkout_locale)
        return processSubscriptionCallback({
            req,
            serviceSupabase,
            token,
            subscriptionRecord,
            locale: localeFromSubscription
        })
    }

    return NextResponse.redirect(buildPlansRedirectUrl({
        req,
        locale: queryLocale,
        action: queryAction === 'topup' ? 'topup' : 'subscribe',
        status: 'error',
        error: 'request_failed'
    }))
}

export async function GET(req: NextRequest) {
    return handleCallback(req)
}

export async function POST(req: NextRequest) {
    const token = await resolveTokenFromBody(req)
    return handleCallback(req, token)
}
