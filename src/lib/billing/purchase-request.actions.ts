'use server'

import { createClient } from '@/lib/supabase/server'
import {
    getBillingPricingCatalog,
    resolveLocalizedMoneyForRegion,
    type BillingPlanTierId,
    type BillingTopupPackId
} from '@/lib/billing/pricing-catalog'
import { sendBillingPurchaseRequestEmail } from '@/lib/billing/purchase-request-email'
import type {
    BillingPurchaseRequestEmailStatus,
    BillingPurchaseRequestType
} from '@/types/database'

export type BillingPurchaseRequestActionError =
    | 'unauthorized'
    | 'invalid_input'
    | 'request_failed'

export interface CreateBillingPurchaseRequestInput {
    organizationId: string
    requestType: BillingPurchaseRequestType
    planId?: string | null
    topupPackId?: string | null
    locale: string
}

export interface CreateBillingPurchaseRequestResult {
    ok: boolean
    status: 'success' | 'error'
    error: BillingPurchaseRequestActionError | null
    requestId: string | null
    emailStatus: BillingPurchaseRequestEmailStatus | null
}

interface OrganizationRow {
    name: string
    billing_region: string | null
}

interface ProfileRow {
    full_name: string | null
    email: string | null
}

function failure(error: BillingPurchaseRequestActionError): CreateBillingPurchaseRequestResult {
    return {
        ok: false,
        status: 'error',
        error,
        requestId: null,
        emailStatus: null
    }
}

function normalizeLocale(value: string) {
    return value.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

function resolveAppOrigin() {
    const candidates = [
        process.env.NEXT_PUBLIC_APP_URL,
        process.env.NEXT_PUBLIC_SITE_URL,
        process.env.SITE_URL,
        process.env.URL
    ]

    for (const candidate of candidates) {
        const trimmed = candidate?.trim()
        if (!trimmed) continue
        try {
            return new URL(trimmed).origin
        } catch {
            continue
        }
    }

    return 'http://localhost:3000'
}

function normalizePlanId(value: string | null | undefined): BillingPlanTierId | null {
    if (value === 'starter' || value === 'growth' || value === 'scale') return value
    return null
}

function normalizeTopupPackId(value: string | null | undefined): BillingTopupPackId | null {
    if (value === 'topup_250' || value === 'topup_500' || value === 'topup_1000') return value
    return null
}

function titleCasePlanId(planId: BillingPlanTierId) {
    return planId.charAt(0).toUpperCase() + planId.slice(1)
}

function buildAdminUrl(input: {
    locale: string
    organizationId: string
}) {
    const locale = normalizeLocale(input.locale)
    return `${resolveAppOrigin()}/${locale}/admin/organizations/${input.organizationId}`
}

export async function createBillingPurchaseRequest(
    input: CreateBillingPurchaseRequestInput
): Promise<CreateBillingPurchaseRequestResult> {
    const organizationId = input.organizationId.trim()
    const locale = normalizeLocale(input.locale)

    if (!organizationId) return failure('invalid_input')

    const supabase = await createClient()
    const { data: authData } = await supabase.auth.getUser()
    const user = authData.user
    if (!user) return failure('unauthorized')

    const membershipCheck = await supabase.rpc('assert_org_member_or_admin', {
        target_organization_id: organizationId
    })
    if (membershipCheck.error) return failure('unauthorized')

    const [organizationResult, profileResult, pricingCatalog] = await Promise.all([
        supabase
            .from('organizations')
            .select('name, billing_region')
            .eq('id', organizationId)
            .maybeSingle(),
        supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', user.id)
            .maybeSingle(),
        getBillingPricingCatalog({ supabase })
    ])

    const organization = (organizationResult.data ?? null) as OrganizationRow | null
    const profile = (profileResult.data ?? null) as ProfileRow | null
    if (!organization) return failure('invalid_input')

    const planId = normalizePlanId(input.planId)
    const topupPackId = normalizeTopupPackId(input.topupPackId)
    const requestType = input.requestType

    const requested = (() => {
        if (requestType === 'plan' || requestType === 'plan_change') {
            if (!planId) return null
            const plan = pricingCatalog.plans.find((candidate) => candidate.id === planId)
            if (!plan) return null
            const money = resolveLocalizedMoneyForRegion(organization.billing_region, {
                priceTry: plan.priceTry,
                priceUsd: plan.priceUsd
            })
            return {
                planId,
                topupPackId: null,
                credits: plan.credits,
                amount: money.amount,
                currency: money.currency,
                label: titleCasePlanId(planId)
            }
        }

        if (requestType === 'topup') {
            if (!topupPackId) return null
            const pack = pricingCatalog.topups.find((candidate) => candidate.id === topupPackId)
            if (!pack) return null
            const money = resolveLocalizedMoneyForRegion(organization.billing_region, {
                priceTry: pack.priceTry,
                priceUsd: pack.priceUsd
            })
            return {
                planId: null,
                topupPackId,
                credits: pack.credits,
                amount: money.amount,
                currency: money.currency,
                label: `Top-up ${pack.credits}`
            }
        }

        if (requestType === 'custom') {
            return {
                planId: null,
                topupPackId: null,
                credits: null,
                amount: null,
                currency: null,
                label: 'Custom package'
            }
        }

        return null
    })()

    if (!requested) return failure('invalid_input')

    const { data: insertedRequest, error: insertError } = await supabase
        .from('billing_purchase_requests')
        .insert({
            organization_id: organizationId,
            requested_by: user.id,
            request_type: requestType,
            requested_plan_id: requested.planId,
            requested_topup_pack_id: requested.topupPackId,
            requested_credits: requested.credits,
            requested_amount: requested.amount,
            requested_currency: requested.currency,
            status: 'new',
            email_status: 'not_configured',
            email_error: null,
            metadata: {
                locale,
                source: 'settings_plans'
            }
        })
        .select('id, created_at')
        .single()

    if (insertError || !insertedRequest) {
        if (insertError) console.error('Failed to insert billing purchase request:', insertError)
        return failure('request_failed')
    }

    const emailResult = await sendBillingPurchaseRequestEmail({
        organizationName: organization.name,
        organizationId,
        requesterName: profile?.full_name ?? null,
        requesterEmail: profile?.email ?? user.email ?? null,
        requestType,
        requestedLabel: requested.label,
        requestedCredits: requested.credits,
        requestedAmount: requested.amount,
        requestedCurrency: requested.currency,
        locale,
        createdAt: insertedRequest.created_at,
        adminUrl: buildAdminUrl({
            locale,
            organizationId
        })
    })

    const emailError = emailResult.error ? emailResult.error.slice(0, 240) : null
    const updateResult = await supabase
        .from('billing_purchase_requests')
        .update({
            email_status: emailResult.status,
            email_error: emailError,
            updated_at: new Date().toISOString()
        })
        .eq('id', insertedRequest.id)

    if (updateResult.error) {
        console.error('Failed to update billing purchase request email status:', updateResult.error)
    }

    return {
        ok: true,
        status: 'success',
        error: null,
        requestId: insertedRequest.id,
        emailStatus: emailResult.status
    }
}
