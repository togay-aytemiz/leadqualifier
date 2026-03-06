import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import {
    retrieveIyzicoSubscriptionCheckoutResult,
    retrieveIyzicoTopupCheckoutResult
} from '@/lib/billing/providers/iyzico/client'
import {
    extractIyzicoCheckoutPaymentConversationId,
    extractIyzicoSubscriptionReferenceCode,
    extractIyzicoSubscriptionStartEnd
} from '@/lib/billing/providers/iyzico/checkout-result'
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

async function processTopupCallback(input: {
    req: NextRequest
    serviceSupabase: ReturnType<typeof createServiceRoleClient>
    token: string
    order: CreditPurchaseOrderRow
    locale: 'tr' | 'en'
}) {
    if (!input.serviceSupabase) {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'topup',
            status: 'error',
            error: 'request_failed'
        }))
    }

    if (input.order.status === 'paid') {
        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'topup',
            status: 'success'
        }))
    }

    const conversationId = input.order.id
    const checkoutResult = await retrieveIyzicoTopupCheckoutResult(input.token, conversationId)
    const paymentStatus = typeof checkoutResult.paymentStatus === 'string'
        ? checkoutResult.paymentStatus.toUpperCase()
        : ''

    if (paymentStatus !== 'SUCCESS') {
        await input.serviceSupabase
            .from('credit_purchase_orders')
            .update({
                status: 'failed',
                metadata: {
                    ...asRecord(input.order.metadata),
                    callback_token: input.token,
                    callback_processed_at: new Date().toISOString(),
                    callback_retrieve_response: checkoutResult
                }
            })
            .eq('id', input.order.id)

        return NextResponse.redirect(buildPlansRedirectUrl({
            req: input.req,
            locale: input.locale,
            action: 'topup',
            status: 'failed'
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
            action: 'topup',
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
    const paymentId = typeof checkoutResult.paymentId === 'string' && checkoutResult.paymentId.trim()
        ? checkoutResult.paymentId.trim()
        : typeof checkoutResult.iyziReferenceCode === 'string' && checkoutResult.iyziReferenceCode.trim()
            ? checkoutResult.iyziReferenceCode.trim()
            : input.token
    const paymentConversationId = extractIyzicoCheckoutPaymentConversationId(checkoutResult)

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
            paid_at: new Date().toISOString(),
            metadata: {
                ...asRecord(input.order.metadata),
                callback_token: input.token,
                callback_processed_at: new Date().toISOString(),
                payment_status: paymentStatus,
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
        action: 'topup',
        status: 'success'
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

    const checkoutResult = await retrieveIyzicoSubscriptionCheckoutResult(input.token)
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
            status: 'failed'
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
        .select('organization_id, monthly_package_credit_limit, monthly_package_credit_used, topup_credit_balance, premium_assigned_at')
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
    const topupBalance = toNonNegativeNumber(billing.topup_credit_balance)

    await input.serviceSupabase
        .from('organization_billing_accounts')
        .update({
            membership_state: 'premium_active',
            lock_reason: 'none',
            current_period_start: periodStart,
            current_period_end: periodEnd,
            monthly_package_credit_limit: requestedCredits,
            monthly_package_credit_used: 0,
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
        await input.serviceSupabase
            .from('organization_credit_ledger')
            .insert({
                organization_id: input.subscriptionRecord.organization_id,
                entry_type: 'package_grant',
                credit_pool: 'package_pool',
                credits_delta: requestedCredits,
                balance_after: requestedCredits + topupBalance,
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
