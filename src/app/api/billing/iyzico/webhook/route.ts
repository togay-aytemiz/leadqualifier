import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { retrieveIyzicoSubscription } from '@/lib/billing/providers/iyzico/client'
import { extractIyzicoRetrievedSubscriptionItem } from '@/lib/billing/providers/iyzico/checkout-result'
import {
    isValidIyzicoSubscriptionWebhookSignature,
    readIyzicoSubscriptionWebhookPayload
} from '@/lib/billing/providers/iyzico/webhook'

export const runtime = 'nodejs'

type ServiceSupabaseClient = NonNullable<ReturnType<typeof createServiceRoleClient>>

interface SubscriptionRecordRow {
    id: string
    organization_id: string
    provider_subscription_id: string | null
    status: string
    period_start: string | null
    period_end: string | null
    metadata: unknown
}

interface BillingAccountRow {
    organization_id: string
    current_period_start: string | null
    current_period_end: string | null
    monthly_package_credit_limit: number | null
    topup_credit_balance: number | null
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

function parseDate(value: string | null | undefined) {
    if (!value) return null
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return date
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

async function findSubscriptionRecord(
    serviceSupabase: ServiceSupabaseClient,
    subscriptionReferenceCode: string
) {
    const { data, error } = await serviceSupabase
        .from('organization_subscription_records')
        .select('id, organization_id, provider_subscription_id, status, period_start, period_end, metadata')
        .eq('provider', 'iyzico')
        .eq('provider_subscription_id', subscriptionReferenceCode)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error || !data) return null
    return data as SubscriptionRecordRow
}

async function findBillingAccount(
    serviceSupabase: ServiceSupabaseClient,
    organizationId: string
) {
    const { data, error } = await serviceSupabase
        .from('organization_billing_accounts')
        .select('organization_id, current_period_start, current_period_end, monthly_package_credit_limit, topup_credit_balance, premium_assigned_at')
        .eq('organization_id', organizationId)
        .maybeSingle()

    if (error || !data) return null
    return data as BillingAccountRow
}

async function handleRenewalSuccess(input: {
    serviceSupabase: ServiceSupabaseClient
    subscriptionRecord: SubscriptionRecordRow
    orderReferenceCode: string
    eventReferenceCode: string | null
}) {
    const metadataRecord = asRecord(input.subscriptionRecord.metadata)
    if (metadataRecord.last_renewal_order_reference_code === input.orderReferenceCode) {
        return NextResponse.json({
            ok: true,
            status: 'ignored'
        })
    }

    const billingAccount = await findBillingAccount(
        input.serviceSupabase,
        input.subscriptionRecord.organization_id
    )
    if (!billingAccount) {
        return NextResponse.json({ error: 'Billing account not found' }, { status: 500 })
    }

    let retrieveResult: unknown
    try {
        retrieveResult = await retrieveIyzicoSubscription({
            subscriptionReferenceCode: input.subscriptionRecord.provider_subscription_id ?? ''
        })
    } catch {
        return NextResponse.json({ error: 'Failed to retrieve subscription detail' }, { status: 500 })
    }
    const subscriptionItem = extractIyzicoRetrievedSubscriptionItem(
        retrieveResult,
        input.subscriptionRecord.provider_subscription_id
    )

    if (!subscriptionItem?.startAt || !subscriptionItem.endAt) {
        return NextResponse.json({ error: 'Invalid subscription detail payload' }, { status: 500 })
    }

    const nowIso = new Date().toISOString()
    const requestedCredits = toNonNegativeNumber(metadataRecord.requested_monthly_credits)
        || toNonNegativeNumber(billingAccount.monthly_package_credit_limit)
    const requestedPriceTry = toNonNegativeNumber(metadataRecord.requested_monthly_price_try)
    const { data: renewalApplyResult, error: renewalApplyError } = await input.serviceSupabase.rpc(
        'apply_iyzico_subscription_renewal_success',
        {
            target_subscription_record_id: input.subscriptionRecord.id,
            target_order_reference_code: input.orderReferenceCode,
            target_event_reference_code: input.eventReferenceCode,
            next_period_start: subscriptionItem.startAt,
            next_period_end: subscriptionItem.endAt,
            requested_monthly_credits: requestedCredits,
            requested_monthly_price_try: requestedPriceTry,
            renewal_retrieve_response: retrieveResult,
            synced_at: nowIso
        }
    )

    if (renewalApplyError) {
        return NextResponse.json({ error: 'Failed to apply renewal success state' }, { status: 500 })
    }

    const resultRecord = asRecord(renewalApplyResult)
    if (resultRecord.status === 'ignored') {
        return NextResponse.json({
            ok: true,
            status: 'ignored'
        })
    }

    return NextResponse.json({ ok: true })
}

async function handleRenewalFailure(input: {
    serviceSupabase: ServiceSupabaseClient
    subscriptionRecord: SubscriptionRecordRow
    orderReferenceCode: string
    eventReferenceCode: string | null
}) {
    const metadataRecord = asRecord(input.subscriptionRecord.metadata)
    if (metadataRecord.last_failed_order_reference_code === input.orderReferenceCode) {
        return NextResponse.json({
            ok: true,
            status: 'ignored'
        })
    }

    const nowIso = new Date().toISOString()
    const nextMetadata = {
        ...metadataRecord,
        last_failed_order_reference_code: input.orderReferenceCode,
        last_failed_event_reference_code: input.eventReferenceCode,
        last_failed_at: nowIso,
        payment_status: 'failed'
    }

    const { error: subscriptionUpdateError } = await input.serviceSupabase
        .from('organization_subscription_records')
        .update({
            status: 'past_due',
            metadata: nextMetadata
        })
        .eq('id', input.subscriptionRecord.id)

    if (subscriptionUpdateError) {
        return NextResponse.json({ error: 'Failed to update subscription failure state' }, { status: 500 })
    }

    const { error: billingUpdateError } = await input.serviceSupabase
        .from('organization_billing_accounts')
        .update({
            membership_state: 'past_due',
            lock_reason: 'past_due',
            updated_at: nowIso
        })
        .eq('organization_id', input.subscriptionRecord.organization_id)

    if (billingUpdateError) {
        return NextResponse.json({ error: 'Failed to update billing failure state' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}

async function handleCancellation(input: {
    serviceSupabase: ServiceSupabaseClient
    subscriptionRecord: SubscriptionRecordRow
    orderReferenceCode: string
    eventReferenceCode: string | null
}) {
    const metadataRecord = asRecord(input.subscriptionRecord.metadata)
    const billingAccount = await findBillingAccount(
        input.serviceSupabase,
        input.subscriptionRecord.organization_id
    )
    const nowIso = new Date().toISOString()
    const periodEndIso = billingAccount?.current_period_end ?? input.subscriptionRecord.period_end ?? null
    const periodEnd = parseDate(periodEndIso)
    const shouldKeepAccessUntilPeriodEnd = Boolean(periodEnd && periodEnd > new Date(nowIso))
    const nextMetadata = {
        ...metadataRecord,
        auto_renew: false,
        cancel_at_period_end: shouldKeepAccessUntilPeriodEnd,
        cancellation_requested_at: typeof metadataRecord.cancellation_requested_at === 'string'
            ? metadataRecord.cancellation_requested_at
            : nowIso,
        canceled_via_provider: 'iyzico_webhook',
        provider_canceled_at: nowIso,
        last_canceled_order_reference_code: input.orderReferenceCode,
        last_canceled_event_reference_code: input.eventReferenceCode
    }

    const { error: subscriptionUpdateError } = await input.serviceSupabase
        .from('organization_subscription_records')
        .update({
            status: shouldKeepAccessUntilPeriodEnd ? input.subscriptionRecord.status : 'canceled',
            canceled_at: shouldKeepAccessUntilPeriodEnd ? null : nowIso,
            period_end: periodEndIso,
            metadata: nextMetadata
        })
        .eq('id', input.subscriptionRecord.id)

    if (subscriptionUpdateError) {
        return NextResponse.json({ error: 'Failed to update canceled subscription state' }, { status: 500 })
    }

    if (shouldKeepAccessUntilPeriodEnd) {
        return NextResponse.json({ ok: true })
    }

    const { error: billingUpdateError } = await input.serviceSupabase
        .from('organization_billing_accounts')
        .update({
            membership_state: 'canceled',
            lock_reason: 'subscription_required',
            current_period_end: periodEndIso ?? nowIso,
            monthly_package_credit_limit: 0,
            monthly_package_credit_used: 0,
            updated_at: nowIso
        })
        .eq('organization_id', input.subscriptionRecord.organization_id)

    if (billingUpdateError) {
        return NextResponse.json({ error: 'Failed to update canceled billing state' }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
}

export async function POST(req: NextRequest) {
    const payload = await req.json().catch(() => null)
    const normalizedPayload = readIyzicoSubscriptionWebhookPayload(payload)
    if (!normalizedPayload) {
        return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })
    }

    const signature = req.headers.get('x-iyz-signature-v3')
    const secretKey = process.env.IYZICO_SECRET_KEY
    if (!isValidIyzicoSubscriptionWebhookSignature({
        payload,
        signature,
        secretKey
    })) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase) {
        return NextResponse.json({ error: 'Webhook service client unavailable' }, { status: 500 })
    }

    const subscriptionRecord = await findSubscriptionRecord(
        serviceSupabase,
        normalizedPayload.subscriptionReferenceCode
    )
    if (!subscriptionRecord) {
        return NextResponse.json({
            ok: true,
            status: 'ignored'
        })
    }

    switch (normalizedPayload.eventType) {
    case 'subscription.order.success':
        return handleRenewalSuccess({
            serviceSupabase,
            subscriptionRecord,
            orderReferenceCode: normalizedPayload.orderReferenceCode,
            eventReferenceCode: normalizedPayload.eventReferenceCode
        })
    case 'subscription.order.failure':
        return handleRenewalFailure({
            serviceSupabase,
            subscriptionRecord,
            orderReferenceCode: normalizedPayload.orderReferenceCode,
            eventReferenceCode: normalizedPayload.eventReferenceCode
        })
    case 'subscription.canceled':
        return handleCancellation({
            serviceSupabase,
            subscriptionRecord,
            orderReferenceCode: normalizedPayload.orderReferenceCode,
            eventReferenceCode: normalizedPayload.eventReferenceCode
        })
    default:
        return NextResponse.json({
            ok: true,
            status: 'ignored'
        })
    }
}
