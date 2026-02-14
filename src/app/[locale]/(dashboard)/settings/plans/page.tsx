import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { PageHeader } from '@/design'
import { SettingsSection } from '@/components/settings/SettingsSection'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getOrganizationBillingSnapshot } from '@/lib/billing/server'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { getCurrentBillingPackageOffer } from '@/lib/billing/package-offer'
import {
    simulateMockSubscriptionCheckout,
    simulateMockTopupCheckout,
    type MockCheckoutError,
    type MockCheckoutResult,
    type MockCheckoutStatus,
    type MockPaymentOutcome
} from '@/lib/billing/mock-checkout'
import { Link } from '@/i18n/navigation'

interface PlansSettingsPageProps {
    searchParams: Promise<{
        checkout_action?: string
        checkout_status?: string
        checkout_error?: string
    }>
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
    return `/${locale}/settings/plans?${query.toString()}`
}

function resolveTopupActionState(snapshot: OrganizationBillingSnapshot | null): {
    allowed: boolean
    reasonKey: 'topupBlockedTrial' | 'topupRequiresPremium' | 'topupAfterPackageExhausted' | 'adminLocked' | 'topupUnavailable' | null
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

    if (!snapshot.isTopupAllowed) {
        return {
            allowed: false,
            reasonKey: 'topupAfterPackageExhausted'
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
    const packageOffer = await getCurrentBillingPackageOffer({
        fallbackMonthlyCredits: snapshot?.package.credits.limit ?? 0,
        supabase
    })
    const formatNumber = new Intl.NumberFormat(locale, {
        maximumFractionDigits: 1
    })
    const formatCurrency = new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'TRY',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })
    const formatDateTime = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    const membershipLabel = snapshot ? resolveMembershipLabel(tPlans, snapshot) : tPlans('membership.unavailable')
    const checkoutAction = search.checkout_action === 'topup' ? 'topup' : search.checkout_action === 'subscribe' ? 'subscribe' : null
    const checkoutStatus = (() => {
        const value = search.checkout_status
        if (value === 'success' || value === 'failed' || value === 'blocked' || value === 'error') {
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
    const subscribeAllowed = snapshot
        ? snapshot.membershipState !== 'premium_active'
            && snapshot.membershipState !== 'admin_locked'
            && packageOffer.monthlyCredits > 0
        : false
    const topupState = resolveTopupActionState(snapshot)
    const showTopupAction = snapshot?.membershipState === 'premium_active'
    const topupCredits = 1000
    const topupAmountTry = (() => {
        if (packageOffer.monthlyPriceTry > 0 && packageOffer.monthlyCredits > 0) {
            const perCredit = packageOffer.monthlyPriceTry / packageOffer.monthlyCredits
            return Number((topupCredits * perCredit).toFixed(2))
        }
        return 40
    })()
    const isTrialMembership = snapshot?.membershipState === 'trial_active' || snapshot?.membershipState === 'trial_exhausted'
    const isPremiumMembership = snapshot?.membershipState === 'premium_active'

    const getCheckoutTitle = () => {
        if (!checkoutStatus) return ''

        if (checkoutStatus === 'success') return tPlans('checkoutStatus.successTitle')
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

    return (
        <>
            <PageHeader title={tPlans('pageTitle')} />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-5xl space-y-6">
                    <p className="text-sm text-gray-500">{tPlans('description')}</p>

                    {checkoutStatus && (
                        <p
                            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                checkoutStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
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
                                </div>

                                {isTrialMembership && (
                                    <>
                                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                            <div className="rounded-2xl border border-gray-200 bg-white p-4">
                                                <p className="text-xs uppercase tracking-wider text-gray-400">{tPlans('status.trialCreditsTitle')}</p>
                                                <p className="mt-2 text-lg font-semibold text-gray-900">
                                                    {formatNumber.format(snapshot.trial.credits.remaining)}
                                                    <span className="ml-1 text-sm font-medium text-gray-500">{tPlans('creditsUnit')}</span>
                                                </p>
                                                <p className="mt-1 text-xs text-gray-500">
                                                    {tPlans('status.usedVsLimit', {
                                                        used: formatNumber.format(snapshot.trial.credits.used),
                                                        limit: formatNumber.format(snapshot.trial.credits.limit)
                                                    })}
                                                </p>
                                                <div className="mt-3 h-2 rounded-full bg-gray-100">
                                                    <div
                                                        className="h-2 rounded-full bg-emerald-500"
                                                        style={{ width: `${Math.min(100, snapshot.trial.credits.progress)}%` }}
                                                    />
                                                </div>
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

                                    </>
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
                                                    used: formatNumber.format(snapshot.package.credits.used),
                                                    limit: formatNumber.format(snapshot.package.credits.limit)
                                                })}
                                            </p>
                                            <div className="mt-3 h-2 rounded-full bg-gray-100">
                                                <div
                                                    className="h-2 rounded-full bg-violet-500"
                                                    style={{ width: `${Math.min(100, snapshot.package.credits.progress)}%` }}
                                                />
                                            </div>
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
                                                {snapshot.isTopupAllowed
                                                    ? tPlans('status.topupAllowed')
                                                    : tPlans('status.topupBlocked')}
                                            </p>
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
                        title={tPlans('actions.title')}
                        description={tPlans('actions.description')}
                    >
                        <div className={`grid grid-cols-1 gap-4 ${showTopupAction ? 'md:grid-cols-2' : ''}`}>
                            {isPremiumMembership ? (
                                <div className="rounded-2xl border border-gray-200 bg-white p-4 space-y-2">
                                    <h3 className="text-sm font-semibold text-gray-900">{tPlans('actions.subscribe.activeTitle')}</h3>
                                    <p className="text-sm text-gray-600">{tPlans('actions.subscribe.activeDescription')}</p>
                                    {snapshot?.package.periodEnd && (
                                        <p className="text-xs text-gray-500">
                                            {tPlans('actions.subscribe.activeResetAt', {
                                                date: formatDateTime.format(new Date(snapshot.package.periodEnd))
                                            })}
                                        </p>
                                    )}
                                </div>
                            ) : (
                                <form action={handleMockSubscribe} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-900">{tPlans('actions.subscribe.title')}</h3>
                                    <p className="text-sm text-gray-600">
                                        {tPlans('actions.subscribe.packageSummary', {
                                            price: formatCurrency.format(packageOffer.monthlyPriceTry),
                                            credits: formatNumber.format(packageOffer.monthlyCredits)
                                        })}
                                    </p>
                                    <input type="hidden" name="organizationId" value={organizationId} />
                                    <input type="hidden" name="monthlyPriceTry" value={String(packageOffer.monthlyPriceTry)} />
                                    <input type="hidden" name="monthlyCredits" value={String(packageOffer.monthlyCredits)} />
                                    <input type="hidden" name="simulatedOutcome" value="success" />
                                    {!subscribeAllowed && (
                                        <p className="text-xs text-amber-700">
                                            {packageOffer.monthlyCredits <= 0
                                                ? tPlans('actions.subscribe.notConfigured')
                                                : snapshot?.membershipState === 'premium_active'
                                                    ? tPlans('actions.subscribe.alreadyActive')
                                                    : tPlans('actions.adminLocked')}
                                        </p>
                                    )}
                                    <button
                                        type="submit"
                                        className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                                        disabled={!subscribeAllowed}
                                    >
                                        {tPlans('actions.subscribe.submit')}
                                    </button>
                                </form>
                            )}

                            {showTopupAction && (
                                <form action={handleMockTopup} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3">
                                    <h3 className="text-sm font-semibold text-gray-900">{tPlans('actions.topup.title')}</h3>
                                    <p className="text-sm text-gray-600">
                                        {tPlans('actions.topup.packageSummary', {
                                            credits: formatNumber.format(topupCredits),
                                            amount: formatCurrency.format(topupAmountTry)
                                        })}
                                    </p>
                                    <input type="hidden" name="organizationId" value={organizationId} />
                                    <input type="hidden" name="credits" value={String(topupCredits)} />
                                    <input type="hidden" name="amountTry" value={String(topupAmountTry)} />
                                    <input type="hidden" name="simulatedOutcome" value="success" />
                                    {!topupState.allowed && topupState.reasonKey && (
                                        <p className="text-xs text-amber-700">{tPlans(`actions.${topupState.reasonKey}`)}</p>
                                    )}
                                    <button
                                        type="submit"
                                        className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                                        disabled={!topupState.allowed}
                                    >
                                        {tPlans('actions.topup.submit')}
                                    </button>
                                </form>
                            )}
                        </div>

                        <div className="mt-4">
                            <Link href="/settings/billing" className="text-sm font-medium text-[#242A40] underline-offset-2 hover:underline">
                                {tPlans('actions.viewUsageLink')}
                            </Link>
                        </div>
                    </SettingsSection>
                </div>
            </div>
        </>
    )
}
