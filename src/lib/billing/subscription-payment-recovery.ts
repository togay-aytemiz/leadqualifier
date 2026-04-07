'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { getBillingProviderConfig } from '@/lib/billing/providers/config'
import {
    initializeIyzicoSubscriptionCardUpdateCheckout,
    IyzicoClientError,
    retryIyzicoSubscriptionPayment,
    type IyzicoLocale
} from '@/lib/billing/providers/iyzico/client'

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

export type PaymentRecoveryActionError =
    | 'unauthorized'
    | 'invalid_input'
    | 'not_available'
    | 'request_failed'

export interface SubscriptionPaymentRecoveryState {
    canRetry: boolean
    canUpdateCard: boolean
    failedOrderReferenceCode: string | null
    customerReferenceCode: string | null
    subscriptionReferenceCode: string | null
}

export interface SubscriptionPaymentRecoveryActionResult {
    ok: boolean
    status: 'success' | 'error'
    error: PaymentRecoveryActionError | null
    recordId?: string | null
}

interface SubscriptionRecoveryRow {
    id: string
    organization_id: string
    provider: string
    provider_subscription_id: string | null
    metadata: unknown
}

function asRecord(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return value as Record<string, unknown>
}

function appendRecordIdToCallbackUrl(callbackUrl: string, recordId: string) {
    try {
        const url = new URL(callbackUrl)
        url.searchParams.set('recordId', recordId)
        return url.toString()
    } catch {
        const separator = callbackUrl.includes('?') ? '&' : '?'
        return `${callbackUrl}${separator}recordId=${encodeURIComponent(recordId)}`
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

async function loadLatestIyzicoSubscriptionRow(input: {
    organizationId: string
    supabase: Pick<SupabaseClient, 'from'>
}) {
    const { data, error } = await input.supabase
        .from('organization_subscription_records')
        .select('id, organization_id, provider, provider_subscription_id, metadata')
        .eq('organization_id', input.organizationId)
        .in('status', ['active', 'past_due'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

    if (error) {
        console.error('Failed to load payment recovery subscription row:', error)
        return null
    }

    const row = data as SubscriptionRecoveryRow | null
    if (!row || row.provider !== 'iyzico') return null
    return row
}

function buildRecoveryState(row: SubscriptionRecoveryRow | null): SubscriptionPaymentRecoveryState {
    if (!row) {
        return {
            canRetry: false,
            canUpdateCard: false,
            failedOrderReferenceCode: null,
            customerReferenceCode: null,
            subscriptionReferenceCode: null
        }
    }

    const metadata = asRecord(row.metadata)
    const failedOrderReferenceCode = typeof metadata.last_failed_order_reference_code === 'string'
        ? metadata.last_failed_order_reference_code
        : null
    const customerReferenceCode = typeof metadata.customer_reference_code === 'string'
        ? metadata.customer_reference_code
        : null

    return {
        canRetry: Boolean(failedOrderReferenceCode),
        canUpdateCard: Boolean(row.provider_subscription_id),
        failedOrderReferenceCode,
        customerReferenceCode,
        subscriptionReferenceCode: row.provider_subscription_id
    }
}

function errorResult(error: PaymentRecoveryActionError): SubscriptionPaymentRecoveryActionResult {
    return {
        ok: false,
        status: 'error',
        error,
        recordId: null
    }
}

export async function getSubscriptionPaymentRecoveryState(input: {
    organizationId: string
    supabase?: Pick<SupabaseClient, 'from'>
}): Promise<SubscriptionPaymentRecoveryState> {
    if (!input.organizationId) return buildRecoveryState(null)

    const supabase = input.supabase ?? await createClient()
    const row = await loadLatestIyzicoSubscriptionRow({
        organizationId: input.organizationId,
        supabase
    })

    return buildRecoveryState(row)
}

export async function retryFailedSubscriptionPayment(input: {
    organizationId: string
    locale: IyzicoLocale
}): Promise<SubscriptionPaymentRecoveryActionResult> {
    if (!input.organizationId) {
        return errorResult('invalid_input')
    }

    if (getBillingProviderConfig().provider !== 'iyzico') {
        return errorResult('not_available')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return errorResult('unauthorized')
    }

    const membershipCheck = await supabase.rpc('assert_org_member_or_admin', {
        target_organization_id: input.organizationId
    })
    if (membershipCheck.error) {
        return errorResult('unauthorized')
    }

    const row = await loadLatestIyzicoSubscriptionRow({
        organizationId: input.organizationId,
        supabase
    })
    const recoveryState = buildRecoveryState(row)
    if (!row || !recoveryState.failedOrderReferenceCode) {
        return errorResult('not_available')
    }

    try {
        await retryIyzicoSubscriptionPayment({
            locale: input.locale,
            conversationId: row.id,
            referenceCode: recoveryState.failedOrderReferenceCode
        })
    } catch (error) {
        console.error('retryIyzicoSubscriptionPayment failed:', error)
        if (error instanceof IyzicoClientError && error.code === 'provider_not_configured') {
            return errorResult('not_available')
        }
        return errorResult('request_failed')
    }

    return {
        ok: true,
        status: 'success',
        error: null,
        recordId: row.id
    }
}

export async function beginSubscriptionPaymentMethodUpdate(input: {
    organizationId: string
    locale: IyzicoLocale
    callbackUrl: string
}): Promise<SubscriptionPaymentRecoveryActionResult> {
    if (!input.organizationId || !input.callbackUrl) {
        return errorResult('invalid_input')
    }

    if (getBillingProviderConfig().provider !== 'iyzico') {
        return errorResult('not_available')
    }

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
        return errorResult('unauthorized')
    }

    const membershipCheck = await supabase.rpc('assert_org_member_or_admin', {
        target_organization_id: input.organizationId
    })
    if (membershipCheck.error) {
        return errorResult('unauthorized')
    }

    const row = await loadLatestIyzicoSubscriptionRow({
        organizationId: input.organizationId,
        supabase
    })
    if (!row?.provider_subscription_id) {
        return errorResult('not_available')
    }

    let initResult: Record<string, unknown>
    try {
        initResult = await initializeIyzicoSubscriptionCardUpdateCheckout({
            locale: input.locale,
            conversationId: row.id,
            subscriptionReferenceCode: row.provider_subscription_id,
            callbackUrl: appendRecordIdToCallbackUrl(input.callbackUrl, row.id)
        }) as Record<string, unknown>
    } catch (error) {
        console.error('initializeIyzicoSubscriptionCardUpdateCheckout failed:', error)
        if (error instanceof IyzicoClientError && error.code === 'provider_not_configured') {
            return errorResult('not_available')
        }
        return errorResult('request_failed')
    }

    const checkoutFormContent = typeof initResult.checkoutFormContent === 'string'
        ? initResult.checkoutFormContent
        : null
    if (!checkoutFormContent) {
        return errorResult('request_failed')
    }

    const serviceSupabase = createServiceRoleClient()
    if (!serviceSupabase) {
        return errorResult('request_failed')
    }

    const metadata = asRecord(row.metadata)
    const { error: updateError } = await serviceSupabase
        .from('organization_subscription_records')
        .update({
            metadata: {
                ...metadata,
                card_update_checkout_form_content: checkoutFormContent,
                last_card_update_requested_at: new Date().toISOString()
            }
        })
        .eq('id', row.id)

    if (updateError) {
        console.error('Failed to persist card update checkout form content:', updateError)
        return errorResult('request_failed')
    }

    return {
        ok: true,
        status: 'success',
        error: null,
        recordId: row.id
    }
}
