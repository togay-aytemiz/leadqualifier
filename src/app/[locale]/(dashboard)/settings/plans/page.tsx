import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getOrganizationBillingSnapshot } from '@/lib/billing/server'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import {
    getBillingPricingCatalog,
    resolveBillingCurrencyByRegion,
    resolveLocalizedMoneyForRegion
} from '@/lib/billing/pricing-catalog'
import {
    simulateMockSubscriptionCheckout,
    simulateMockTopupCheckout,
    type MockCheckoutError,
    type MockCheckoutResult,
    type MockCheckoutStatus,
    type MockPaymentOutcome
} from '@/lib/billing/mock-checkout'
import {
    cancelSubscriptionRenewal,
    getSubscriptionRenewalState,
    resumeSubscriptionRenewal,
    type RenewalActionError,
    type RenewalActionResult,
    type RenewalActionStatus
} from '@/lib/billing/subscription-renewal'
import {
    calculateSidebarBillingProgress,
    isLowCreditWarningVisible
} from '@/lib/billing/sidebar-progress'
import { Link } from '@/i18n/navigation'
import { AlertCircle } from 'lucide-react'
import { TopupCheckoutCard, type TopupPackOption } from './TopupCheckoutCard'
import { SubscriptionPlanManager, type SubscriptionPlanOption } from './SubscriptionPlanManager'

interface PlansSettingsPageProps {
    searchParams: Promise<{
        checkout_action?: string
        checkout_status?: string
        checkout_error?: string
        checkout_change_type?: string
        checkout_effective_at?: string
        renewal_action?: string
        renewal_status?: string
        renewal_error?: string
    }>
}

type SupabaseClient = Awaited<ReturnType<typeof createClient>>

async function getPaidTopupCreditsTotal(
    organizationId: string,
    supabase: SupabaseClient
) {
    const { data, error } = await supabase
        .from('credit_purchase_orders')
        .select('credits')
        .eq('organization_id', organizationId)
        .eq('status', 'paid')

    if (error) {
        console.error('Failed to load paid top-up credits total for plans page:', error)
        return 0
    }

    return (data ?? []).reduce((sum, row) => {
        const credits = Number(row.credits ?? 0)
        if (!Number.isFinite(credits) || credits <= 0) return sum
        return sum + credits
    }, 0)
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

function toMockOutcome(value: string): MockPaymentOutcome {
    if (value === 'failed') return 'failed'
    return 'success'
}

function toPositiveNumber(value: string) {
    const parsed = Number.parseFloat(value)
    if (!Number.isFinite(parsed)) return Number.NaN
    return parsed
}

function buildCheckoutRedirect(
    locale: string,
    action: 'subscribe' | 'topup',
    result: MockCheckoutResult
) {
    const query = new URLSearchParams()
    query.set('checkout_action', action)
    query.set('checkout_status', result.status)
    if (result.error) {
        query.set('checkout_error', result.error)
    }
    if (result.changeType) {
        query.set('checkout_change_type', result.changeType)
    }
    if (result.effectiveAt) {
        query.set('checkout_effective_at', result.effectiveAt)
    }
    return `/${locale}/settings/plans?${query.toString()}`
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
    return `/${locale}/settings/plans?${query.toString()}`
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

export default async function PlansSettingsPage({ searchParams }: PlansSettingsPageProps) {
    const supabase = await createClient()
    const locale = await getLocale()
    const tPlans = await getTranslations('billingPlans')
    const search = await searchParams

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tPlans('noOrganization')}</h2>
                    <p>{tPlans('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    const snapshot = await getOrganizationBillingSnapshot(organizationId, { supabase })
    const [pricingCatalog, paidTopupCreditsTotal, subscriptionRenewalState, organizationRegionResult] = await Promise.all([
        getBillingPricingCatalog({
            supabase
        }),
        getPaidTopupCreditsTotal(organizationId, supabase),
        getSubscriptionRenewalState({
            organizationId,
            supabase
        }),
        supabase
            .from('organizations')
            .select('billing_region')
            .eq('id', organizationId)
            .maybeSingle()
    ])

    if (organizationRegionResult.error) {
        console.error('Failed to load organization billing region for plans page:', organizationRegionResult.error)
    }
    const organizationBillingRegion = organizationRegionResult.data?.billing_region ?? 'TR'
    const billingCurrency = resolveBillingCurrencyByRegion(organizationBillingRegion)
    const formatNumber = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1
    })
    const formatCurrency = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: billingCurrency,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2
    })
    const formatDateTime = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
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

    const activePlanId = snapshot?.membershipState === 'premium_active'
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
    const activePlanOption = activePlanId
        ? localizedPlanTiers.find((plan) => plan.id === activePlanId) ?? null
        : null
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
            || value === 'not_available'
            || value === 'request_failed'
            || value === 'topup_not_allowed'
            || value === 'admin_locked'
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
    const topupState = resolveTopupActionState(snapshot)
    const isTrialMembership = snapshot?.membershipState === 'trial_active' || snapshot?.membershipState === 'trial_exhausted'
    const isPremiumMembership = snapshot?.membershipState === 'premium_active'
    const autoRenewEnabled = subscriptionRenewalState.autoRenew
    const renewalPeriodEnd = subscriptionRenewalState.periodEnd ?? snapshot?.package.periodEnd ?? null
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
    const topupTotalCredits = snapshot
        ? Math.max(snapshot.topupBalance, paidTopupCreditsTotal)
        : 0
    const topupCreditsProgress = topupTotalCredits > 0 && snapshot
        ? Math.min(100, Math.max(0, (snapshot.topupBalance / topupTotalCredits) * 100))
        : 0

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
        case 'not_available':
            return tPlans('checkoutStatus.errors.notAvailable')
        case 'admin_locked':
            return tPlans('checkoutStatus.errors.adminLocked')
        case 'topup_not_allowed':
            return tPlans('checkoutStatus.errors.topupNotAllowed')
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

    const handleMockSubscribe = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')
        const simulatedOutcome = toMockOutcome(String(formData.get('simulatedOutcome') ?? 'success'))
        const monthlyPriceTry = toPositiveNumber(String(formData.get('monthlyPriceTry') ?? '0'))
        const monthlyCredits = toPositiveNumber(String(formData.get('monthlyCredits') ?? '0'))

        const result = await simulateMockSubscriptionCheckout({
            organizationId: orgId,
            simulatedOutcome,
            monthlyPriceTry,
            monthlyCredits
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)
        redirect(buildCheckoutRedirect(locale, 'subscribe', result))
    }

    const handleMockTopup = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')
        const simulatedOutcome = toMockOutcome(String(formData.get('simulatedOutcome') ?? 'success'))
        const credits = toPositiveNumber(String(formData.get('credits') ?? '0'))
        const amountTry = toPositiveNumber(String(formData.get('amountTry') ?? '0'))

        const result = await simulateMockTopupCheckout({
            organizationId: orgId,
            simulatedOutcome,
            credits,
            amountTry
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)
        redirect(buildCheckoutRedirect(locale, 'topup', result))
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

    const handleResumeRenewal = async (formData: FormData) => {
        'use server'

        const orgId = String(formData.get('organizationId') ?? '')

        const result = await resumeSubscriptionRenewal({
            organizationId: orgId,
            reason: 'self_serve_resume_renewal'
        })

        revalidatePath(`/${locale}/settings/plans`)
        revalidatePath(`/${locale}/settings/billing`)
        redirect(buildRenewalRedirect(locale, 'resume', result))
    }

    return (
        <>
            <PageHeader title={tPlans('pageTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl space-y-6">
                    <p className="text-sm text-gray-500">{tPlans('description')}</p>

                    {checkoutStatus && (
                        <p
                            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                checkoutStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : checkoutStatus === 'scheduled'
                                        ? 'border-sky-200 bg-sky-50 text-sky-900'
                                    : checkoutStatus === 'failed' || checkoutStatus === 'blocked'
                                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                                        : 'border-rose-200 bg-rose-50 text-rose-900'
                            }`}
                        >
                            {getCheckoutTitle()}
                            {' — '}
                            {getCheckoutDescription()}
                        </p>
                    )}

                    {renewalStatus && (
                        <p
                            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                renewalStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : renewalStatus === 'blocked'
                                        ? 'border-amber-200 bg-amber-50 text-amber-900'
                                        : 'border-rose-200 bg-rose-50 text-rose-900'
                            }`}
                        >
                            {getRenewalTitle()}
                            {' — '}
                            {getRenewalDescription()}
                        </p>
                    )}

                    <SettingsSection
                        title={tPlans('status.title')}
                        description={tPlans('status.description')}
                    >
                        {snapshot ? (
                            <div className="space-y-4">
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
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
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

                                        <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                            <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.topupCreditsTitle')}</p>
                                            <p className="mt-2 text-lg font-semibold text-gray-900">
                                                {formatNumber.format(snapshot.topupBalance)}
                                                <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('creditsUnit')}</span>
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500">
                                                {tPlans('status.usedVsLimit', {
                                                    used: formatNumber.format(snapshot.topupBalance),
                                                    limit: formatNumber.format(topupTotalCredits)
                                                })}
                                            </p>
                                            <div className="mt-3 h-2 rounded-full bg-gray-100">
                                                <div
                                                    className="h-2 rounded-full bg-purple-600"
                                                    style={{ width: `${Math.min(100, topupCreditsProgress)}%` }}
                                                />
                                            </div>
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

                    <SettingsSection
                        title={tPlans('packageCatalog.title')}
                        description={tPlans('packageCatalog.description')}
                        descriptionAddon={(
                            <Link
                                href="/settings/billing"
                                className="text-sm font-medium text-[#242A40] underline decoration-1 underline-offset-2 hover:text-[#1f2437]"
                            >
                                {tPlans('actions.viewUsageLink')}
                            </Link>
                        )}
                    >
                        <div className="space-y-4">
                            {isPremiumMembership && activePlanOption ? (
                                <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                                        <div>
                                            <p className="text-xs uppercase tracking-wider text-gray-400">
                                                {tPlans('packageCatalog.currentPackageLabel')}
                                            </p>
                                            <p className="mt-1 text-xl font-semibold text-gray-900">
                                                {activePlanName ?? tPlans('status.currentPackageUnknown')}
                                            </p>
                                            <p className="mt-3 text-sm text-gray-700">
                                                {tPlans('packageCatalog.creditsIncluded', {
                                                    credits: formatNumber.format(activePlanOption.credits)
                                                })}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-600">
                                                {tPlans('packageCatalog.approxConversations', {
                                                    min: formatNumber.format(activePlanOption.conversationRange.min),
                                                    max: formatNumber.format(activePlanOption.conversationRange.max)
                                                })}
                                            </p>
                                            <p className="mt-1 text-xs text-gray-500">
                                                {tPlans('packageCatalog.unitPrice', {
                                                    price: formatCurrency.format(activePlanOption.unitPrice)
                                                })}
                                            </p>
                                        </div>

                                        <p className="tabular-nums text-4xl font-semibold leading-tight text-gray-900 md:text-right">
                                            {formatCurrency.format(activePlanOption.localizedPrice)}
                                            <span className="ml-1 text-base font-medium text-gray-500">
                                                / {tPlans('packageCatalog.month')}
                                            </span>
                                        </p>
                                    </div>
                                </article>
                            ) : (
                                <p className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                                    {activePlanName
                                        ? tPlans('packageCatalog.currentPackageActive', { plan: activePlanName })
                                        : tPlans('packageCatalog.currentPackageInactive')}
                                </p>
                            )}

                            {isPremiumMembership ? (
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
                                    planAction={handleMockSubscribe}
                                    cancelAction={handleCancelRenewal}
                                    resumeAction={handleResumeRenewal}
                                />
                            ) : (
                                <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
                                    {localizedPlanTiers.map((plan) => {
                                        const isPopularPlan = plan.id === 'growth'
                                        return (
                                            <article
                                                key={plan.id}
                                                className={`flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                                                    isPopularPlan ? 'border-sky-200' : 'border-gray-200'
                                                }`}
                                            >
                                                <div className="mb-4 flex min-h-7 items-center justify-between gap-2">
                                                    <p className="text-sm font-semibold text-gray-900">
                                                        {tPlans(`packageCatalog.planNames.${plan.id}`)}
                                                    </p>
                                                    {isPopularPlan && (
                                                        <p className="rounded-full bg-sky-100 px-2.5 py-1 text-[11px] font-semibold text-sky-800">
                                                            {tPlans('packageCatalog.badges.popular')}
                                                        </p>
                                                    )}
                                                </div>

                                                <p className="tabular-nums text-3xl font-semibold leading-tight text-gray-900">
                                                    {formatCurrency.format(plan.localizedPrice)}
                                                    <span className="ml-1 text-base font-medium text-gray-500">
                                                        / {tPlans('packageCatalog.month')}
                                                    </span>
                                                </p>
                                                <p className="mt-3 text-sm text-gray-700">
                                                    {tPlans('packageCatalog.creditsIncluded', {
                                                        credits: formatNumber.format(plan.credits)
                                                    })}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-600">
                                                    {tPlans('packageCatalog.approxConversations', {
                                                        min: formatNumber.format(plan.conversationRange.min),
                                                        max: formatNumber.format(plan.conversationRange.max)
                                                    })}
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {tPlans('packageCatalog.unitPrice', {
                                                        price: formatCurrency.format(plan.unitPrice)
                                                    })}
                                                </p>

                                                <form action={handleMockSubscribe} className="mt-4">
                                                    <input type="hidden" name="organizationId" value={organizationId} />
                                                    <input type="hidden" name="monthlyPriceTry" value={String(plan.priceTry)} />
                                                    <input type="hidden" name="monthlyCredits" value={String(plan.credits)} />
                                                    <input type="hidden" name="simulatedOutcome" value="success" />
                                                    <button
                                                        type="submit"
                                                        className="inline-flex h-10 min-w-[132px] items-center justify-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                                                        disabled={!canSubmitPlanSelection}
                                                    >
                                                        {tPlans('packageCatalog.planCta.start')}
                                                    </button>
                                                </form>
                                            </article>
                                        )
                                    })}
                                </div>
                            )}

                            <article className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 p-5">
                                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                        <p className="text-base font-semibold text-gray-900">
                                            {tPlans('packageCatalog.customPackage.title')}
                                        </p>
                                        <p className="mt-1 text-sm text-gray-600">
                                            {tPlans('packageCatalog.customPackage.description')}
                                        </p>
                                    </div>
                                    <a
                                        href="mailto:askqualy@gmail.com"
                                        className="inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437]"
                                    >
                                        {tPlans('packageCatalog.customPackage.cta')}
                                    </a>
                                </div>
                            </article>

                            {!canSubmitPlanSelection && (
                                <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                                    {tPlans('actions.adminLocked')}
                                </p>
                            )}
                        </div>
                    </SettingsSection>

                    <SettingsSection
                        title={tPlans('topups.sectionTitle')}
                        description={tPlans('topups.sectionDescription')}
                    >
                        <TopupCheckoutCard
                            organizationId={organizationId}
                            packs={topupPacks}
                            topupAllowed={topupState.allowed}
                            blockedReason={topupBlockedReason}
                            topupAction={handleMockTopup}
                        />
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
