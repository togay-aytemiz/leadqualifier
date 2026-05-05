import { after } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { getTranslations } from 'next-intl/server'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { Link } from '@/i18n/navigation'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import {
    getBillingPricingCatalog,
    resolveLocalizedMoneyForRegion
} from '@/lib/billing/pricing-catalog'
import { getBillingProviderConfig } from '@/lib/billing/providers/config'
import {
    normalizeBillingRegion,
    resolveBillingRegionForOrganization,
    resolveBillingRegionFromRequestHeaders
} from '@/lib/billing/request-region'
import {
    type MockCheckoutError,
    type MockCheckoutStatus
} from '@/lib/billing/mock-checkout'
import {
    createBillingPurchaseRequest,
    type BillingPurchaseRequestActionError,
    type CreateBillingPurchaseRequestResult
} from '@/lib/billing/purchase-request.actions'
import {
    cancelSubscriptionRenewal,
    getSubscriptionRenewalState,
    type RenewalActionError,
    type RenewalActionResult,
    type RenewalActionStatus
} from '@/lib/billing/subscription-renewal'
import {
    beginSubscriptionPaymentMethodUpdate,
    getSubscriptionPaymentRecoveryState,
    retryFailedSubscriptionPayment,
    type PaymentRecoveryActionError,
    type SubscriptionPaymentRecoveryActionResult
} from '@/lib/billing/subscription-payment-recovery'
import {
    calculateSidebarBillingProgress,
    isLowCreditWarningVisible
} from '@/lib/billing/sidebar-progress'
import { getOrganizationBillingLedger, getOrganizationBillingSnapshot } from '@/lib/billing/server'
import { buildBillingHistoryRows } from '@/lib/billing/history'
import { getOrganizationTopupStatusSummary } from '@/lib/billing/topup-status'
import { resolveMetaOrigin } from '@/lib/channels/meta-origin'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'
import { AlertCircle } from 'lucide-react'
import { PlansBillingInformationCard } from './PlansBillingInformationCard'
import { PlansStatusBanner } from './PlansStatusBanner'
import { SubscriptionPlanCatalog } from './SubscriptionPlanCatalog'
import { SubscriptionPlanManager, type SubscriptionPlanOption } from './SubscriptionPlanManager'
import { TopupCheckoutCard, type TopupPackOption } from './TopupCheckoutCard'
import { resolvePremiumStatusVisibility } from './status-visibility'

export interface PlansSettingsSearchParams {
    checkout_action?: string
    checkout_status?: string
    checkout_error?: string
    checkout_change_type?: string
    checkout_effective_at?: string
    renewal_action?: string
    renewal_status?: string
    renewal_error?: string
    payment_recovery_action?: string
    payment_recovery_status?: string
    payment_recovery_error?: string
    purchase_request_status?: string
    purchase_request_error?: string
}

interface PlansSettingsPageContentProps {
    organizationId: string
    locale: string
    search: PlansSettingsSearchParams
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

interface BillingHistorySubscriptionLookupRow {
    metadata: unknown
}

interface BillingHistoryOrderLookupRow {
    credits: number
    amountTry: number
    currency: string | null
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null
    return value as Record<string, unknown>
}

function readString(record: Record<string, unknown> | null, key: string): string | null {
    const value = record?.[key]
    return typeof value === 'string' && value.trim().length > 0 ? value : null
}

function formatLedgerCurrency(locale: string, amount: number, currency: string | null) {
    if (!Number.isFinite(amount)) return null
    const normalizedCurrency = currency && currency.trim().length > 0 ? currency.trim().toUpperCase() : 'TRY'
    try {
        return new Intl.NumberFormat(locale, {
            style: 'currency',
            currency: normalizedCurrency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }).format(amount)
    } catch {
        return null
    }
}

function resolveMembershipLabel(
    tPlans: Awaited<ReturnType<typeof getTranslations>>,
    snapshot: OrganizationBillingSnapshot
) {
    switch (snapshot.membershipState) {
    case 'trial_active':
        return tPlans('membership.trialActive')
    case 'trial_exhausted':
        return tPlans('membership.trialExhausted')
    case 'premium_active':
        return tPlans('membership.premiumActive')
    case 'past_due':
        return tPlans('membership.pastDue')
    case 'canceled':
        return tPlans('membership.canceled')
    case 'admin_locked':
        return tPlans('membership.adminLocked')
    default:
        return snapshot.membershipState
    }
}

function readHeaderValue(value: string | null | undefined) {
    if (!value) return null
    const first = value.split(',')[0]?.trim() || null
    return first || null
}

function normalizeCheckoutLocale(locale: string) {
    return locale.toLowerCase().startsWith('en') ? 'en' : 'tr'
}

function resolveRequestOriginFromHeaders(requestHeaders: Awaited<ReturnType<typeof headers>>) {
    const host = readHeaderValue(requestHeaders.get('x-forwarded-host'))
        ?? readHeaderValue(requestHeaders.get('host'))
        ?? 'localhost:3000'
    const proto = readHeaderValue(requestHeaders.get('x-forwarded-proto'))
        ?? (host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('0.0.0.0')
            ? 'http'
            : 'https')

    return `${proto}://${host}`
}

function buildRenewalRedirect(
    locale: string,
    action: 'cancel' | 'resume',
    result: RenewalActionResult
) {
    const query = new URLSearchParams()
    query.set('renewal_action', action)
    query.set('renewal_status', result.status)
    if (result.error) {
        query.set('renewal_error', result.error)
    }
    return `${buildLocalizedPath('/settings/plans', locale)}?${query.toString()}`
}

function buildPurchaseRequestRedirect(
    locale: string,
    result: CreateBillingPurchaseRequestResult
) {
    const query = new URLSearchParams()
    query.set('purchase_request_status', result.status)
    if (result.error) {
        query.set('purchase_request_error', result.error)
    }
    return `${buildLocalizedPath('/settings/plans', locale)}?${query.toString()}`
}

function buildPaymentRecoveryRedirect(
    locale: string,
    action: 'card_update' | 'retry_payment',
    result: SubscriptionPaymentRecoveryActionResult
) {
    const query = new URLSearchParams()
    query.set('payment_recovery_action', action)
    query.set('payment_recovery_status', result.status)
    if (result.error) {
        query.set('payment_recovery_error', result.error)
    }
    return `${buildLocalizedPath('/settings/plans', locale)}?${query.toString()}`
}

function resolveTopupActionState(snapshot: OrganizationBillingSnapshot | null): {
    allowed: boolean
    reasonKey: 'topupBlockedTrial' | 'topupRequiresPremium' | 'adminLocked' | 'topupUnavailable' | null
} {
    if (!snapshot) {
        return {
            allowed: false,
            reasonKey: 'topupUnavailable'
        }
    }

    if (snapshot.membershipState === 'admin_locked') {
        return {
            allowed: false,
            reasonKey: 'adminLocked'
        }
    }

    if (snapshot.membershipState === 'trial_active' || snapshot.membershipState === 'trial_exhausted') {
        return {
            allowed: false,
            reasonKey: 'topupBlockedTrial'
        }
    }

    if (snapshot.membershipState !== 'premium_active') {
        return {
            allowed: false,
            reasonKey: 'topupRequiresPremium'
        }
    }

    return {
        allowed: true,
        reasonKey: null
    }
}

export default async function PlansSettingsPageContent({
    organizationId,
    locale,
    search
}: PlansSettingsPageContentProps) {
    const supabase = await createClient()
    const requestHeaders = await headers()
    const tPlans = await getTranslations('billingPlans')
    const [
        { data: authData },
        { data: organizationRecord, error: organizationError },
        { data: billingProfileData, error: billingProfileError },
        snapshot,
        billingLedger,
        pricingCatalog,
        topupStatusSummary,
        subscriptionRenewalState,
        paymentRecoveryState
    ] = await Promise.all([
        supabase.auth.getUser(),
        supabase
            .from('organizations')
            .select('name, billing_region')
            .eq('id', organizationId)
            .maybeSingle(),
        supabase
            .from('organization_billing_profiles')
            .select('company_name, billing_email, billing_phone, tax_identity_number, address_line_1, city, postal_code, country')
            .eq('organization_id', organizationId)
            .maybeSingle(),
        getOrganizationBillingSnapshot(organizationId, { supabase }),
        getOrganizationBillingLedger(organizationId, {
            supabase,
            limit: 50,
            entryTypes: ['package_grant', 'purchase_credit']
        }),
        getBillingPricingCatalog({
            supabase
        }),
        getOrganizationTopupStatusSummary(organizationId, supabase),
        getSubscriptionRenewalState({
            organizationId,
            supabase
        }),
        getSubscriptionPaymentRecoveryState({
            organizationId,
            supabase
        })
    ])

    if (organizationError) {
        console.error('Failed to load organization billing region for plans page:', organizationError)
    }

    if (billingProfileError) {
        console.error('Failed to load billing profile for plans page:', billingProfileError)
    }

    const requestBillingRegion = resolveBillingRegionFromRequestHeaders(requestHeaders)
    const appOrigin = resolveMetaOrigin({
        appUrl: process.env.NEXT_PUBLIC_APP_URL,
        siteUrl: process.env.SITE_URL ?? null,
        forwardedHost: requestHeaders.get('x-forwarded-host'),
        forwardedProto: requestHeaders.get('x-forwarded-proto'),
        requestOrigin: resolveRequestOriginFromHeaders(requestHeaders)
    })
    const checkoutLocale = normalizeCheckoutLocale(locale)
    const paymentMethodUpdateCallbackUrl = `${appOrigin}/api/billing/iyzico/card-update/callback?locale=${checkoutLocale}`
    const organizationBillingRegion = resolveBillingRegionForOrganization({
        organizationBillingRegion: organizationRecord?.billing_region,
        headers: requestHeaders
    })

    if (!normalizeBillingRegion(organizationRecord?.billing_region)) {
        after(async () => {
            const billingRegionUpdateResult = await supabase
                .from('organizations')
                .update({
                    billing_region: requestBillingRegion,
                    updated_at: new Date().toISOString()
                })
                .eq('id', organizationId)

            if (billingRegionUpdateResult.error) {
                console.error('Failed to persist organization billing region from request signals:', billingRegionUpdateResult.error)
            }
        })
    }

    const formatNumber = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1
    })
    const formatDateTime = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    const formatDate = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
    const authEmail = authData.user?.email?.trim() ?? ''
    const organizationName = organizationRecord?.name?.trim() ?? ''
    const billingProfile = (billingProfileData ?? null) as BillingProfileRow | null
    const relatedSubscriptionIds: string[] = []
    const relatedOrderIds: string[] = []

    for (const entry of billingLedger) {
        const metadata = toRecord(entry.metadata)
        const subscriptionId = readString(metadata, 'subscription_id')
            ?? readString(metadata, 'subscription_record_id')
        const orderId = readString(metadata, 'order_id')

        if (subscriptionId && !relatedSubscriptionIds.includes(subscriptionId)) {
            relatedSubscriptionIds.push(subscriptionId)
        }
        if (orderId && !relatedOrderIds.includes(orderId)) {
            relatedOrderIds.push(orderId)
        }
    }

    const subscriptionsById = new Map<string, BillingHistorySubscriptionLookupRow>()
    const ordersById = new Map<string, BillingHistoryOrderLookupRow>()

    if (relatedSubscriptionIds.length > 0) {
        const { data, error } = await supabase
            .from('organization_subscription_records')
            .select('id, metadata')
            .eq('organization_id', organizationId)
            .in('id', relatedSubscriptionIds)

        if (error) {
            console.error('Failed to load plans billing subscription history rows:', error)
        } else {
            for (const row of data ?? []) {
                subscriptionsById.set(row.id, {
                    metadata: row.metadata
                })
            }
        }
    }

    if (relatedOrderIds.length > 0) {
        const { data, error } = await supabase
            .from('credit_purchase_orders')
            .select('id, credits, amount_try, currency')
            .eq('organization_id', organizationId)
            .in('id', relatedOrderIds)

        if (error) {
            console.error('Failed to load plans billing order history rows:', error)
        } else {
            for (const row of data ?? []) {
                ordersById.set(row.id, {
                    credits: Number(row.credits ?? 0),
                    amountTry: Number(row.amount_try ?? 0),
                    currency: row.currency
                })
            }
        }
    }

    const historyRows = buildBillingHistoryRows({
        entries: billingLedger,
        subscriptions: subscriptionsById,
        orders: ordersById,
        formatDate: (value) => formatDateTime.format(new Date(value)),
        formatCurrency: (amount, currency) => formatLedgerCurrency(locale, amount, currency),
        labels: {
            statusSuccess: tPlans('billingInfo.status.success'),
            amountUnavailable: tPlans('billingInfo.amountUnavailable'),
            packageStart: tPlans('billingInfo.historyDetails.packageStart'),
            packageUpgrade: tPlans('billingInfo.historyDetails.packageUpgrade'),
            packageRenewal: tPlans('billingInfo.historyDetails.packageRenewal'),
            packageUpdate: tPlans('billingInfo.historyDetails.packageUpdate'),
            topupPurchase: tPlans('billingInfo.historyDetails.topupPurchase')
        }
    })

    const localizedPlanTiers = pricingCatalog.plans.map((plan) => {
        const localizedMoney = resolveLocalizedMoneyForRegion(organizationBillingRegion, {
            priceTry: plan.priceTry,
            priceUsd: plan.priceUsd
        })
        return {
            ...plan,
            currency: localizedMoney.currency,
            localizedPrice: localizedMoney.amount,
            unitPrice: plan.credits > 0 ? localizedMoney.amount / plan.credits : 0
        }
    })
    const subscriptionPlanOptions: SubscriptionPlanOption[] = localizedPlanTiers.map((plan) => ({
        id: plan.id,
        credits: plan.credits,
        priceTry: plan.priceTry,
        localizedPrice: plan.localizedPrice,
        currency: plan.currency,
        conversationRange: plan.conversationRange,
        unitPrice: plan.unitPrice
    }))
    const topupPacks: TopupPackOption[] = pricingCatalog.topups.map((pack) => {
        const localizedMoney = resolveLocalizedMoneyForRegion(organizationBillingRegion, {
            priceTry: pack.priceTry,
            priceUsd: pack.priceUsd
        })
        return {
            id: pack.id,
            credits: pack.credits,
            amountTry: pack.priceTry,
            localizedAmount: localizedMoney.amount,
            currency: localizedMoney.currency,
            conversationRange: pack.conversationRange
        }
    })

    const isManagedSubscriptionMembership = snapshot?.membershipState === 'premium_active'
        || snapshot?.membershipState === 'past_due'
    const activePlanId = isManagedSubscriptionMembership
        ? localizedPlanTiers.find(
            (plan) => Math.round(plan.credits) === Math.round(snapshot.package.credits.limit)
        )?.id ?? null
        : null
    const activePlanName = activePlanId
        ? tPlans(`packageCatalog.planNames.${activePlanId}`)
        : null
    const activePlanCredits = activePlanId
        ? localizedPlanTiers.find((plan) => plan.id === activePlanId)?.credits ?? 0
        : 0
    const canSubmitPlanSelection = snapshot
        ? snapshot.membershipState !== 'admin_locked'
        : false
    const membershipLabel = snapshot ? resolveMembershipLabel(tPlans, snapshot) : tPlans('membership.unavailable')
    const checkoutAction = search.checkout_action === 'topup' ? 'topup' : search.checkout_action === 'subscribe' ? 'subscribe' : null
    const checkoutStatus = (() => {
        const value = search.checkout_status
        if (
            value === 'success'
            || value === 'scheduled'
            || value === 'failed'
            || value === 'blocked'
            || value === 'error'
        ) {
            return value as MockCheckoutStatus
        }
        return null
    })()
    const checkoutError = (() => {
        const value = search.checkout_error
        if (
            value === 'unauthorized'
            || value === 'invalid_input'
            || value === 'legal_consent_required'
            || value === 'not_available'
            || value === 'request_failed'
            || value === 'topup_not_allowed'
            || value === 'admin_locked'
            || value === 'provider_not_configured'
            || value === 'insufficient_funds'
            || value === 'payment_not_approved'
            || value === 'security_check_failed'
            || value === 'expired_card'
            || value === 'invalid_cvc'
            || value === 'internet_shopping_disabled'
            || value === 'card_not_supported'
            || value === 'payment_processing_error'
        ) {
            return value as MockCheckoutError
        }
        return null
    })()
    const checkoutChangeType = typeof search.checkout_change_type === 'string'
        ? search.checkout_change_type
        : null
    const checkoutEffectiveAt = typeof search.checkout_effective_at === 'string'
        ? search.checkout_effective_at
        : null
    const renewalAction = (() => {
        const value = search.renewal_action
        if (value === 'cancel' || value === 'resume') {
            return value as 'cancel' | 'resume'
        }
        return null
    })()
    const renewalStatus = (() => {
        const value = search.renewal_status
        if (value === 'success' || value === 'blocked' || value === 'error') {
            return value as RenewalActionStatus
        }
        return null
    })()
    const renewalError = (() => {
        const value = search.renewal_error
        if (
            value === 'unauthorized'
            || value === 'invalid_input'
            || value === 'not_available'
            || value === 'request_failed'
            || value === 'admin_locked'
            || value === 'premium_required'
        ) {
            return value as RenewalActionError
        }
        return null
    })()
    const paymentRecoveryAction = (() => {
        const value = search.payment_recovery_action
        if (value === 'card_update' || value === 'retry_payment') {
            return value as 'card_update' | 'retry_payment'
        }
        return null
    })()
    const paymentRecoveryStatus = (() => {
        const value = search.payment_recovery_status
        if (value === 'success' || value === 'error') {
            return value as 'success' | 'error'
        }
        return null
    })()
    const paymentRecoveryError = (() => {
        const value = search.payment_recovery_error
        if (
            value === 'unauthorized'
            || value === 'invalid_input'
            || value === 'not_available'
            || value === 'request_failed'
        ) {
            return value as PaymentRecoveryActionError
        }
        return null
    })()
    const purchaseRequestStatus = (() => {
        const value = search.purchase_request_status
        if (value === 'success' || value === 'error') {
            return value as 'success' | 'error'
        }
        return null
    })()
    const purchaseRequestError = (() => {
        const value = search.purchase_request_error
        if (
            value === 'unauthorized'
            || value === 'invalid_input'
            || value === 'request_failed'
        ) {
            return value as BillingPurchaseRequestActionError
        }
        return null
    })()
    const topupState = resolveTopupActionState(snapshot)
    const isTrialMembership = snapshot?.membershipState === 'trial_active' || snapshot?.membershipState === 'trial_exhausted'
    const isPremiumMembership = snapshot?.membershipState === 'premium_active'
    const supportsAutoRenewResume = getBillingProviderConfig().provider !== 'iyzico'
    const autoRenewEnabled = subscriptionRenewalState.autoRenew
    const renewalPeriodEnd = subscriptionRenewalState.periodEnd ?? snapshot?.package.periodEnd ?? null
    const nextBillingDateLabel = renewalPeriodEnd
        ? formatDate.format(new Date(renewalPeriodEnd))
        : tPlans('billingInfo.nextBillingDateUnavailable')
    const defaultCountry = (() => {
        const savedCountry = billingProfile?.country?.trim()
        if (savedCountry) {
            if (locale.toLowerCase().startsWith('tr') && savedCountry === 'Turkey') {
                return 'Türkiye'
            }
            return savedCountry
        }

        return locale.toLowerCase().startsWith('tr') ? 'Türkiye' : ''
    })()
    const billingFormValues = {
        companyName: billingProfile?.company_name ?? organizationName,
        billingEmail: billingProfile?.billing_email ?? authEmail,
        billingPhone: billingProfile?.billing_phone ?? '',
        taxIdentityNumber: billingProfile?.tax_identity_number ?? '',
        addressLine1: billingProfile?.address_line_1 ?? '',
        city: billingProfile?.city ?? '',
        postalCode: billingProfile?.postal_code ?? '',
        country: defaultCountry
    }
    const pendingPlanChange = subscriptionRenewalState.pendingPlanChange
    const hasPendingDowngrade = pendingPlanChange?.changeType === 'downgrade'
    const pendingPlanId = hasPendingDowngrade
        ? localizedPlanTiers.find(
            (plan) => Math.round(plan.credits) === Math.round(pendingPlanChange.requestedMonthlyCredits)
        )?.id ?? null
        : null
    const pendingPlanName = pendingPlanId
        ? tPlans(`packageCatalog.planNames.${pendingPlanId}`)
        : null
    const topupBlockedReason = !topupState.allowed && topupState.reasonKey
        ? tPlans(`actions.${topupState.reasonKey}`)
        : null
    const trialCreditsProgress = snapshot
        ? calculateSidebarBillingProgress({
            membershipState: 'trial_active',
            trialRemainingCredits: snapshot.trial.credits.remaining,
            trialCreditLimit: snapshot.trial.credits.limit,
            packageRemainingCredits: 0,
            packageCreditLimit: 0,
            topupBalance: 0
        })
        : 0
    const packageCreditsProgress = snapshot
        ? calculateSidebarBillingProgress({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: snapshot.package.credits.remaining,
            packageCreditLimit: snapshot.package.credits.limit,
            topupBalance: 0
        })
        : 0
    const showTrialLowCreditWarning = snapshot
        ? isLowCreditWarningVisible({
            membershipState: 'trial_active',
            trialRemainingCredits: snapshot.trial.credits.remaining,
            trialCreditLimit: snapshot.trial.credits.limit,
            packageRemainingCredits: 0,
            packageCreditLimit: 0,
            topupBalance: 0
        })
        : false
    const showPremiumLowCreditWarning = snapshot
        ? isLowCreditWarningVisible({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: snapshot.package.credits.remaining,
            packageCreditLimit: snapshot.package.credits.limit,
            topupBalance: snapshot.topupBalance
        })
        : false
    const premiumStatusVisibility = resolvePremiumStatusVisibility({
        snapshot,
        consumedTopupCreditsTotal: topupStatusSummary.consumedTopupCreditsTotal,
        hasTrialCreditCarryover: topupStatusSummary.hasTrialCreditCarryover
    })
    const usageViewLink = (
        <Link
            href="/settings/billing"
            className="text-sm font-medium text-[#242A40] underline decoration-1 underline-offset-2 hover:text-[#1f2437]"
        >
            {tPlans('actions.viewUsageLink')}
        </Link>
    )

    const getCheckoutTitle = () => {
        if (!checkoutStatus) return ''

        if (checkoutStatus === 'success') return tPlans('checkoutStatus.successTitle')
        if (checkoutStatus === 'scheduled') return tPlans('checkoutStatus.scheduledTitle')
        if (checkoutStatus === 'failed') return tPlans('checkoutStatus.failedTitle')
        if (checkoutStatus === 'blocked') return tPlans('checkoutStatus.blockedTitle')
        return tPlans('checkoutStatus.errorTitle')
    }

    const getCheckoutDescription = () => {
        if (!checkoutStatus) return ''

        if (checkoutStatus === 'success') {
            return checkoutAction === 'topup'
                ? tPlans('checkoutStatus.successTopup')
                : tPlans('checkoutStatus.successSubscribe')
        }

        if (checkoutStatus === 'scheduled') {
            if (checkoutAction === 'subscribe' && checkoutChangeType === 'downgrade') {
                if (checkoutEffectiveAt) {
                    return tPlans('checkoutStatus.scheduledDowngradeWithDate', {
                        date: formatDateTime.format(new Date(checkoutEffectiveAt))
                    })
                }
                return tPlans('checkoutStatus.scheduledDowngradeNoDate')
            }
            return tPlans('checkoutStatus.scheduledGeneric')
        }

        if (checkoutStatus === 'failed') {
            switch (checkoutError) {
            case 'insufficient_funds':
                return tPlans('checkoutStatus.errors.insufficientFunds')
            case 'payment_not_approved':
                return tPlans('checkoutStatus.errors.paymentNotApproved')
            case 'security_check_failed':
                return tPlans('checkoutStatus.errors.securityCheckFailed')
            case 'expired_card':
                return tPlans('checkoutStatus.errors.expiredCard')
            case 'invalid_cvc':
                return tPlans('checkoutStatus.errors.invalidCvc')
            case 'internet_shopping_disabled':
                return tPlans('checkoutStatus.errors.internetShoppingDisabled')
            case 'card_not_supported':
                return tPlans('checkoutStatus.errors.cardNotSupported')
            case 'payment_processing_error':
                return tPlans('checkoutStatus.errors.paymentProcessingError')
            default:
                break
            }
            return checkoutAction === 'topup'
                ? tPlans('checkoutStatus.failedTopup')
                : tPlans('checkoutStatus.failedSubscribe')
        }

        if (checkoutStatus === 'blocked') {
            if (checkoutError === 'topup_not_allowed') return tPlans('checkoutStatus.errors.topupNotAllowed')
            if (checkoutError === 'admin_locked') return tPlans('checkoutStatus.errors.adminLocked')
            return tPlans('checkoutStatus.errors.requestFailed')
        }

        switch (checkoutError) {
        case 'unauthorized':
            return tPlans('checkoutStatus.errors.unauthorized')
        case 'invalid_input':
            return tPlans('checkoutStatus.errors.invalidInput')
        case 'legal_consent_required':
            return tPlans('checkoutStatus.errors.legalConsentRequired')
        case 'not_available':
            return tPlans('checkoutStatus.errors.notAvailable')
        case 'admin_locked':
            return tPlans('checkoutStatus.errors.adminLocked')
        case 'topup_not_allowed':
            return tPlans('checkoutStatus.errors.topupNotAllowed')
        case 'provider_not_configured':
            return tPlans('checkoutStatus.errors.providerNotConfigured')
        case 'insufficient_funds':
            return tPlans('checkoutStatus.errors.insufficientFunds')
        case 'payment_not_approved':
            return tPlans('checkoutStatus.errors.paymentNotApproved')
        case 'security_check_failed':
            return tPlans('checkoutStatus.errors.securityCheckFailed')
        case 'expired_card':
            return tPlans('checkoutStatus.errors.expiredCard')
        case 'invalid_cvc':
            return tPlans('checkoutStatus.errors.invalidCvc')
        case 'internet_shopping_disabled':
            return tPlans('checkoutStatus.errors.internetShoppingDisabled')
        case 'card_not_supported':
            return tPlans('checkoutStatus.errors.cardNotSupported')
        case 'payment_processing_error':
            return tPlans('checkoutStatus.errors.paymentProcessingError')
        default:
            return tPlans('checkoutStatus.errors.requestFailed')
        }
    }

    const getRenewalTitle = () => {
        if (!renewalStatus) return ''

        if (renewalStatus === 'success') return tPlans('renewalStatus.successTitle')
        if (renewalStatus === 'blocked') return tPlans('renewalStatus.blockedTitle')
        return tPlans('renewalStatus.errorTitle')
    }

    const getRenewalDescription = () => {
        if (!renewalStatus) return ''

        if (renewalStatus === 'success') {
            return renewalAction === 'cancel'
                ? tPlans('renewalStatus.successCancel')
                : tPlans('renewalStatus.successResume')
        }

        switch (renewalError) {
        case 'unauthorized':
            return tPlans('renewalStatus.errors.unauthorized')
        case 'invalid_input':
            return tPlans('renewalStatus.errors.invalidInput')
        case 'not_available':
            return tPlans('renewalStatus.errors.notAvailable')
        case 'admin_locked':
            return tPlans('renewalStatus.errors.adminLocked')
        case 'premium_required':
            return tPlans('renewalStatus.errors.premiumRequired')
        default:
            return tPlans('renewalStatus.errors.requestFailed')
        }
    }

    const getPaymentRecoveryTitle = () => {
        if (!paymentRecoveryStatus) return ''
        return paymentRecoveryStatus === 'success'
            ? tPlans('paymentRecoveryStatus.successTitle')
            : tPlans('paymentRecoveryStatus.errorTitle')
    }

    const getPaymentRecoveryDescription = () => {
        if (!paymentRecoveryStatus || !paymentRecoveryAction) return ''

        if (paymentRecoveryStatus === 'success') {
            return paymentRecoveryAction === 'card_update'
                ? tPlans('paymentRecoveryStatus.successCardUpdate')
                : tPlans('paymentRecoveryStatus.successRetryPayment')
        }

        switch (paymentRecoveryError) {
        case 'unauthorized':
            return tPlans('paymentRecoveryStatus.errors.unauthorized')
        case 'invalid_input':
            return tPlans('paymentRecoveryStatus.errors.invalidInput')
        case 'not_available':
            return tPlans('paymentRecoveryStatus.errors.notAvailable')
        default:
            return tPlans('paymentRecoveryStatus.errors.requestFailed')
        }
    }

    const getPurchaseRequestTitle = () => {
        if (!purchaseRequestStatus) return ''
        return purchaseRequestStatus === 'success'
            ? tPlans('purchaseRequest.status.successTitle')
            : tPlans('purchaseRequest.status.errorTitle')
    }

    const getPurchaseRequestDescription = () => {
        if (!purchaseRequestStatus) return ''

        if (purchaseRequestStatus === 'success') {
            return tPlans('purchaseRequest.status.successDescription')
        }

        switch (purchaseRequestError) {
        case 'unauthorized':
            return tPlans('purchaseRequest.status.errors.unauthorized')
        case 'invalid_input':
            return tPlans('purchaseRequest.status.errors.invalidInput')
        default:
            return tPlans('purchaseRequest.status.errors.requestFailed')
        }
    }

    const handlePurchaseRequest = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')
        const requestTypeValue = String(formData.get('requestType') ?? '').trim()
        const requestType = requestTypeValue === 'plan'
            || requestTypeValue === 'plan_change'
            || requestTypeValue === 'topup'
            || requestTypeValue === 'custom'
            ? requestTypeValue
            : 'custom'

        const result = await createBillingPurchaseRequest({
            organizationId: orgId,
            locale: checkoutLocale,
            requestType,
            planId: String(formData.get('planId') ?? '').trim() || null,
            topupPackId: String(formData.get('packId') ?? '').trim() || null
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)
        redirect(buildPurchaseRequestRedirect(locale, result))
    }

    const handleCancelRenewal = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')

        const result = await cancelSubscriptionRenewal({
            organizationId: orgId,
            reason: 'self_serve_cancel_renewal'
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)
        redirect(buildRenewalRedirect(locale, 'cancel', result))
    }

    const handleUpdatePaymentMethod = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')

        const result = await beginSubscriptionPaymentMethodUpdate({
            organizationId: orgId,
            locale: checkoutLocale,
            callbackUrl: paymentMethodUpdateCallbackUrl
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)

        if (result.ok && result.recordId) {
            redirect(buildLocalizedPath(`/settings/plans/payment-method-update/${result.recordId}`, locale))
        }

        redirect(buildPaymentRecoveryRedirect(locale, 'card_update', result))
    }

    const handleRetryFailedPayment = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')

        const result = await retryFailedSubscriptionPayment({
            organizationId: orgId,
            locale: checkoutLocale
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)
        redirect(buildPaymentRecoveryRedirect(locale, 'retry_payment', result))
    }

    return (
        <div className="flex-1 overflow-auto p-8">
            <div className="max-w-6xl space-y-6">
                <p className="text-sm text-gray-500">{tPlans('description')}</p>

                {checkoutStatus && (
                    <PlansStatusBanner
                        className={
                            checkoutStatus === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : checkoutStatus === 'scheduled'
                                    ? 'border-sky-200 bg-sky-50 text-sky-900'
                                    : checkoutStatus === 'failed' || checkoutStatus === 'blocked'
                                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                                        : 'border-rose-200 bg-rose-50 text-rose-900'
                        }
                        dismissLabel={tPlans('statusBanner.dismiss')}
                        title={getCheckoutTitle()}
                        description={getCheckoutDescription()}
                    />
                )}

                {renewalStatus && (
                    <PlansStatusBanner
                        className={
                            renewalStatus === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : renewalStatus === 'blocked'
                                    ? 'border-amber-200 bg-amber-50 text-amber-900'
                                    : 'border-rose-200 bg-rose-50 text-rose-900'
                        }
                        dismissLabel={tPlans('statusBanner.dismiss')}
                        title={getRenewalTitle()}
                        description={getRenewalDescription()}
                    />
                )}

                {paymentRecoveryStatus && paymentRecoveryAction && (
                    <PlansStatusBanner
                        className={
                            paymentRecoveryStatus === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : 'border-rose-200 bg-rose-50 text-rose-900'
                        }
                        dismissLabel={tPlans('statusBanner.dismiss')}
                        title={getPaymentRecoveryTitle()}
                        description={getPaymentRecoveryDescription()}
                    />
                )}

                {purchaseRequestStatus && (
                    <PlansStatusBanner
                        className={
                            purchaseRequestStatus === 'success'
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                : 'border-rose-200 bg-rose-50 text-rose-900'
                        }
                        dismissLabel={tPlans('statusBanner.dismiss')}
                        title={getPurchaseRequestTitle()}
                        description={getPurchaseRequestDescription()}
                    />
                )}

                {snapshot?.membershipState === 'past_due' && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {tPlans('renewalFailureNotice.title')}
                        {' — '}
                        {tPlans('renewalFailureNotice.description')}
                    </div>
                )}

                <SettingsSection
                    title={tPlans('status.title')}
                    description={tPlans('status.description')}
                    descriptionAddon={isManagedSubscriptionMembership ? usageViewLink : undefined}
                >
                    {snapshot ? (
                        <div className="space-y-4">
                            {!isManagedSubscriptionMembership && (
                                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                        <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.membershipLabel')}</p>
                                        <p className="rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-800">{membershipLabel}</p>
                                    </div>
                                    {isPremiumMembership && (
                                        <p className="mt-2 text-sm text-gray-700">
                                            {activePlanName
                                                ? tPlans('status.currentPackage', { plan: activePlanName })
                                                : tPlans('status.currentPackageUnknown')}
                                        </p>
                                    )}
                                </div>
                            )}

                            {isTrialMembership && (
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.trialCreditsTitle')}</p>
                                        <p className="mt-2 text-lg font-semibold text-gray-900">
                                            {formatNumber.format(snapshot.trial.credits.remaining)}
                                            <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('creditsUnit')}</span>
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {tPlans('status.usedVsLimit', {
                                                used: formatNumber.format(snapshot.trial.credits.remaining),
                                                limit: formatNumber.format(snapshot.trial.credits.limit)
                                            })}
                                        </p>
                                        <div className="mt-3 h-2 rounded-full bg-gray-100">
                                            <div
                                                className="h-2 rounded-full bg-[#242A40]"
                                                style={{ width: `${Math.min(100, trialCreditsProgress)}%` }}
                                            />
                                        </div>
                                        {showTrialLowCreditWarning && (
                                            <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                                                <AlertCircle size={12} />
                                                {tPlans('status.lowCreditWarning')}
                                            </p>
                                        )}
                                    </div>

                                    <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                        <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.trialTimeTitle')}</p>
                                        <p className="mt-2 text-lg font-semibold text-gray-900">
                                            {formatNumber.format(snapshot.trial.remainingDays)}
                                            <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('status.daysUnit')}</span>
                                        </p>
                                        <p className="mt-1 text-xs text-gray-500">
                                            {tPlans('status.trialEndsAt', {
                                                date: formatDateTime.format(new Date(snapshot.trial.endsAt))
                                            })}
                                        </p>
                                        <div className="mt-3 h-2 rounded-full bg-gray-100">
                                            <div
                                                className="h-2 rounded-full bg-sky-500"
                                                style={{ width: `${Math.min(100, snapshot.trial.timeProgress)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            )}

                            {isPremiumMembership && (
                                <div className="space-y-4">
                                    {isManagedSubscriptionMembership && (
                                        <SubscriptionPlanManager
                                            organizationId={organizationId}
                                            plans={subscriptionPlanOptions}
                                            activePlanId={activePlanId}
                                            activePlanCredits={activePlanCredits}
                                            canManage={canSubmitPlanSelection}
                                            autoRenewEnabled={autoRenewEnabled}
                                            renewalPeriodEnd={renewalPeriodEnd}
                                            pendingPlanId={hasPendingDowngrade ? pendingPlanId : null}
                                            pendingPlanName={hasPendingDowngrade ? pendingPlanName : null}
                                            pendingPlanEffectiveAt={hasPendingDowngrade ? pendingPlanChange?.effectiveAt ?? null : null}
                                            supportsAutoRenewResume={supportsAutoRenewResume}
                                            paymentRecoveryState={paymentRecoveryState}
                                            planAction={handlePurchaseRequest}
                                            cancelAction={handleCancelRenewal}
                                            retryPaymentAction={handleRetryFailedPayment}
                                            updatePaymentMethodAction={handleUpdatePaymentMethod}
                                        />
                                    )}

                                    {premiumStatusVisibility.showTotalCreditsCard && (
                                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                            <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.totalCreditsTitle')}</p>
                                            <p className="mt-2 text-lg font-semibold text-gray-900">
                                                {formatNumber.format(snapshot.totalRemainingCredits)}
                                                <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('creditsUnit')}</span>
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500">{tPlans('status.creditPriorityTopupFirst')}</p>
                                        </div>
                                    )}

                                    <div className={`grid grid-cols-1 gap-4${premiumStatusVisibility.showTopupCreditsCard ? ' md:grid-cols-2' : ''}`}>
                                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                            <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.packageCreditsTitle')}</p>
                                            <p className="mt-2 text-lg font-semibold text-gray-900">
                                                {formatNumber.format(snapshot.package.credits.remaining)}
                                                <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('creditsUnit')}</span>
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500">
                                                {tPlans('status.usedVsLimit', {
                                                    used: formatNumber.format(snapshot.package.credits.remaining),
                                                    limit: formatNumber.format(snapshot.package.credits.limit)
                                                })}
                                            </p>
                                            <div className="mt-3 h-2 rounded-full bg-gray-100">
                                                <div
                                                    className="h-2 rounded-full bg-[#242A40]"
                                                    style={{ width: `${Math.min(100, packageCreditsProgress)}%` }}
                                                />
                                            </div>
                                            {showPremiumLowCreditWarning && (
                                                <p className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-800">
                                                    <AlertCircle size={12} />
                                                    {tPlans('status.lowCreditWarning')}
                                                </p>
                                            )}
                                            {snapshot.package.periodEnd && (
                                                <p className="mt-2 text-xs text-gray-500">
                                                    {tPlans('status.packageResetAt', {
                                                        date: formatDateTime.format(new Date(snapshot.package.periodEnd))
                                                    })}
                                                </p>
                                            )}
                                        </div>

                                        {premiumStatusVisibility.showTopupCreditsCard && (
                                            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                                <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.topupCreditsTitle')}</p>
                                                <p className="mt-2 text-lg font-semibold text-gray-900">
                                                    {formatNumber.format(snapshot.topupBalance)}
                                                    <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('creditsUnit')}</span>
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {tPlans('status.usedVsLimit', {
                                                        used: formatNumber.format(snapshot.topupBalance),
                                                        limit: formatNumber.format(premiumStatusVisibility.topupTotalCredits)
                                                    })}
                                                </p>
                                                <div className="mt-3 h-2 rounded-full bg-gray-100">
                                                    <div
                                                        className="h-2 rounded-full bg-purple-600"
                                                        style={{ width: `${Math.min(100, premiumStatusVisibility.topupCreditsProgress)}%` }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {!isTrialMembership && !isPremiumMembership && (
                                <p className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                                    {tPlans('status.nonActiveMembershipNote')}
                                </p>
                            )}
                        </div>
                    ) : (
                        <p className="text-sm text-gray-500">{tPlans('status.unavailable')}</p>
                    )}
                </SettingsSection>

                {!isManagedSubscriptionMembership && (
                    <SettingsSection
                        title={tPlans('packageCatalog.title')}
                        description={tPlans('packageCatalog.description')}
                        descriptionAddon={usageViewLink}
                    >
                        <div className="space-y-4">
                            <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                                {activePlanName
                                    ? tPlans('packageCatalog.currentPackageActive', { plan: activePlanName })
                                    : tPlans('packageCatalog.currentPackageInactive')}
                            </p>

                            <SubscriptionPlanCatalog
                                organizationId={organizationId}
                                plans={localizedPlanTiers}
                                canSubmit={canSubmitPlanSelection}
                                planAction={handlePurchaseRequest}
                            />

                            {!canSubmitPlanSelection && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                                    {tPlans('actions.adminLocked')}
                                </p>
                            )}
                        </div>
                    </SettingsSection>
                )}

                <SettingsSection
                    title={tPlans('topups.sectionTitle')}
                    description={tPlans('topups.sectionDescription')}
                >
                    <div className="space-y-4">
                        <TopupCheckoutCard
                            organizationId={organizationId}
                            packs={topupPacks}
                            topupAllowed={topupState.allowed}
                            blockedReason={topupBlockedReason}
                            topupAction={handlePurchaseRequest}
                        />

                        <article className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="max-w-2xl">
                                    <p className="text-base font-semibold text-gray-900">
                                        {tPlans('packageCatalog.customPackage.title')}
                                    </p>
                                    <p className="mt-1 text-sm text-gray-600">
                                        {tPlans('packageCatalog.customPackage.description')}
                                    </p>
                                </div>
                                <a
                                    href="mailto:askqualy@gmail.com"
                                    className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition-colors hover:border-gray-400 hover:bg-gray-100"
                                >
                                    {tPlans('packageCatalog.customPackage.cta')}
                                </a>
                            </div>
                        </article>
                    </div>
                </SettingsSection>

                <SettingsSection
                    title={tPlans('billingInfo.sectionTitle')}
                    description={tPlans('billingInfo.sectionDescription')}
                >
                    <PlansBillingInformationCard
                        locale={locale}
                        organizationId={organizationId}
                        nextBillingDateLabel={nextBillingDateLabel}
                        formValues={billingFormValues}
                        historyRows={historyRows}
                    />
                </SettingsSection>
            </div>
        </div>
    )
}
