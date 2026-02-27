import { revalidatePath } from 'next/cache'
import { notFound, redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Badge, DataTable, PageHeader, TableBody, TableCell, TableHead, TableRow } from '@/design'
import { ArrowLeft, ScrollText, Users } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import {
    getAdminOrganizationDetail,
    type AdminBillingAuditEntry,
    type AdminBillingSnapshot
} from '@/lib/admin/read-models'
import { formatStorageSize } from '@/lib/billing/usage'
import {
    adminAdjustPackageCredits,
    adminAdjustTrialCredits,
    adminAdjustTopupCredits,
    adminAssignPremium,
    adminCancelPremium,
    adminExtendTrial,
    adminSetMembershipOverride,
    type AdminBillingActionError,
    type AdminBillingActionResult
} from '@/lib/admin/billing-manual'
import type { BillingLockReason, BillingMembershipState } from '@/types/database'

interface AdminOrganizationDetailsPageProps {
    params: Promise<{ id: string }>
    searchParams: Promise<{
        billing_action?: string
        billing_status?: string
        billing_error?: string
    }>
}

function resolveMembershipBadgeVariant(state: AdminBillingSnapshot['membershipState']) {
    if (state === 'premium_active') return 'purple' as const
    if (state === 'trial_active') return 'info' as const
    if (state === 'trial_exhausted' || state === 'past_due') return 'warning' as const
    if (state === 'admin_locked' || state === 'canceled') return 'error' as const
    return 'neutral' as const
}

function resolveMembershipLabel(tAdmin: Awaited<ReturnType<typeof getTranslations>>, billing: AdminBillingSnapshot) {
    switch (billing.membershipState) {
    case 'trial_active':
        return tAdmin('status.membership.trialActive')
    case 'trial_exhausted':
        return tAdmin('status.membership.trialExhausted')
    case 'premium_active':
        return tAdmin('status.membership.premiumActive')
    case 'past_due':
        return tAdmin('status.membership.pastDue')
    case 'canceled':
        return tAdmin('status.membership.canceled')
    case 'admin_locked':
        return tAdmin('status.membership.adminLocked')
    default:
        return tAdmin('status.notAvailable')
    }
}

function resolveMembershipStateOptionLabel(
    tAdmin: Awaited<ReturnType<typeof getTranslations>>,
    state: BillingMembershipState
) {
    switch (state) {
    case 'trial_active':
        return tAdmin('status.membership.trialActive')
    case 'trial_exhausted':
        return tAdmin('status.membership.trialExhausted')
    case 'premium_active':
        return tAdmin('status.membership.premiumActive')
    case 'past_due':
        return tAdmin('status.membership.pastDue')
    case 'canceled':
        return tAdmin('status.membership.canceled')
    case 'admin_locked':
        return tAdmin('status.membership.adminLocked')
    default:
        return state
    }
}

function resolveLockReasonLabel(tAdmin: Awaited<ReturnType<typeof getTranslations>>, billing: AdminBillingSnapshot) {
    switch (billing.lockReason) {
    case 'none':
        return tAdmin('status.lockReason.none')
    case 'trial_time_expired':
        return tAdmin('status.lockReason.trialTimeExpired')
    case 'trial_credits_exhausted':
        return tAdmin('status.lockReason.trialCreditsExhausted')
    case 'subscription_required':
        return tAdmin('status.lockReason.subscriptionRequired')
    case 'package_credits_exhausted':
        return tAdmin('status.lockReason.packageCreditsExhausted')
    case 'past_due':
        return tAdmin('status.lockReason.pastDue')
    case 'admin_locked':
        return tAdmin('status.lockReason.adminLocked')
    default:
        return tAdmin('status.notAvailable')
    }
}

function resolveLockReasonOptionLabel(
    tAdmin: Awaited<ReturnType<typeof getTranslations>>,
    lockReason: BillingLockReason
) {
    switch (lockReason) {
    case 'none':
        return tAdmin('status.lockReason.none')
    case 'trial_time_expired':
        return tAdmin('status.lockReason.trialTimeExpired')
    case 'trial_credits_exhausted':
        return tAdmin('status.lockReason.trialCreditsExhausted')
    case 'subscription_required':
        return tAdmin('status.lockReason.subscriptionRequired')
    case 'package_credits_exhausted':
        return tAdmin('status.lockReason.packageCreditsExhausted')
    case 'past_due':
        return tAdmin('status.lockReason.pastDue')
    case 'admin_locked':
        return tAdmin('status.lockReason.adminLocked')
    default:
        return lockReason
    }
}

function resolveBillingAuditActionLabel(
    tAdmin: Awaited<ReturnType<typeof getTranslations>>,
    actionType: AdminBillingAuditEntry['actionType']
) {
    switch (actionType) {
    case 'extend_trial':
        return tAdmin('organizationDetail.billingAudit.actionType.extendTrial')
    case 'credit_adjustment':
        return tAdmin('organizationDetail.billingAudit.actionType.creditAdjustment')
    case 'premium_assign':
        return tAdmin('organizationDetail.billingAudit.actionType.premiumAssign')
    case 'premium_cancel':
        return tAdmin('organizationDetail.billingAudit.actionType.premiumCancel')
    case 'package_config_update':
        return tAdmin('organizationDetail.billingAudit.actionType.packageConfigUpdate')
    default:
        return tAdmin('organizationDetail.billingAudit.actionType.unknown')
    }
}

function buildBillingActionRedirect(
    locale: string,
    organizationId: string,
    action: string,
    result: AdminBillingActionResult
) {
    const query = new URLSearchParams()
    query.set('billing_action', action)
    query.set('billing_status', result.ok ? 'success' : 'error')
    if (!result.ok && result.error) {
        query.set('billing_error', result.error)
    }
    return `/${locale}/admin/organizations/${organizationId}?${query.toString()}`
}

export default async function AdminOrganizationDetailsPage({ params, searchParams }: AdminOrganizationDetailsPageProps) {
    const { id } = await params
    const search = await searchParams
    const locale = await getLocale()
    const { supabase } = await requireSystemAdmin(locale)
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')

    const details = await getAdminOrganizationDetail(id, supabase)
    if (!details) {
        notFound()
    }

    const formatDate = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
    const formatDateTime = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    })
    const todayDate = new Date().toISOString().slice(0, 10)
    const defaultTrialEndDate = details.organization.billing.trialEndsAt?.slice(0, 10) ?? todayDate
    const defaultPeriodStartDate = todayDate
    const defaultPeriodEndDate = (() => {
        const currentPeriodEnd = details.organization.billing.currentPeriodEnd?.slice(0, 10)
        if (currentPeriodEnd) return currentPeriodEnd
        const nextMonth = new Date()
        nextMonth.setMonth(nextMonth.getMonth() + 1)
        return nextMonth.toISOString().slice(0, 10)
    })()
    const formatNumber = new Intl.NumberFormat(locale)
    const formatStorageLabel = (bytes: number) => {
        const formatted = formatStorageSize(bytes, locale)
        return `${formatted.value} ${formatted.unit}`
    }
    const billingActionError = (search.billing_error ?? null) as AdminBillingActionError | null
    const billingActionStatus = search.billing_status === 'success'
        ? 'success'
        : search.billing_status === 'error'
            ? 'error'
            : null
    const billingAction = search.billing_action ?? null
    const membershipStateOptions: BillingMembershipState[] = [
        'trial_active',
        'trial_exhausted',
        'premium_active',
        'past_due',
        'canceled',
        'admin_locked'
    ]
    const lockReasonOptions: BillingLockReason[] = [
        'none',
        'trial_time_expired',
        'trial_credits_exhausted',
        'subscription_required',
        'package_credits_exhausted',
        'past_due',
        'admin_locked'
    ]

    const getActionStatusTitle = () => {
        if (billingActionStatus === 'success') {
            return tAdmin('organizationDetail.manualActions.successTitle')
        }
        if (billingActionStatus === 'error') {
            return tAdmin('organizationDetail.manualActions.errorTitle')
        }
        return ''
    }

    const getActionStatusDescription = () => {
        if (billingActionStatus === 'success') {
            return tAdmin('organizationDetail.manualActions.successDescription')
        }

        if (billingActionStatus !== 'error') return ''

        switch (billingActionError) {
        case 'unauthorized':
            return tAdmin('organizationDetail.manualActions.errors.unauthorized')
        case 'forbidden':
            return tAdmin('organizationDetail.manualActions.errors.forbidden')
        case 'invalid_input':
            return tAdmin('organizationDetail.manualActions.errors.invalidInput')
        case 'not_available':
            return tAdmin('organizationDetail.manualActions.errors.notAvailable')
        default:
            return tAdmin('organizationDetail.manualActions.errors.requestFailed')
        }
    }

    const getActionLabel = () => {
        switch (billingAction) {
        case 'extend_trial':
            return tAdmin('organizationDetail.manualActions.actionLabels.extendTrial')
        case 'adjust_topup':
            return tAdmin('organizationDetail.manualActions.actionLabels.adjustTopup')
        case 'adjust_trial':
            return tAdmin('organizationDetail.manualActions.actionLabels.adjustTrial')
        case 'adjust_package':
            return tAdmin('organizationDetail.manualActions.actionLabels.adjustPackage')
        case 'assign_premium':
            return tAdmin('organizationDetail.manualActions.actionLabels.assignPremium')
        case 'cancel_premium':
            return tAdmin('organizationDetail.manualActions.actionLabels.cancelPremium')
        case 'set_membership':
            return tAdmin('organizationDetail.manualActions.actionLabels.setMembership')
        default:
            return null
        }
    }

    const handleExtendTrial = async (formData: FormData) => {
        'use server'

        const dateInput = String(formData.get('trialEndsAt') ?? '').trim()
        const reason = String(formData.get('trialReason') ?? '')
        const trialEndsAtIso = dateInput
            ? new Date(`${dateInput}T23:59:59.000Z`).toISOString()
            : ''

        const result = await adminExtendTrial({
            organizationId: id,
            trialEndsAtIso,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'extend_trial', result))
    }

    const handleAdjustTopup = async (formData: FormData) => {
        'use server'

        const deltaRaw = String(formData.get('creditDelta') ?? '').trim()
        const reason = String(formData.get('creditReason') ?? '')
        const creditDelta = Number.parseFloat(deltaRaw)

        const result = await adminAdjustTopupCredits({
            organizationId: id,
            creditDelta,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'adjust_topup', result))
    }

    const handleAssignPremium = async (formData: FormData) => {
        'use server'

        const periodStartInput = String(formData.get('periodStart') ?? '').trim()
        const periodEndInput = String(formData.get('periodEnd') ?? '').trim()
        const monthlyPriceRaw = String(formData.get('monthlyPriceTry') ?? '').trim()
        const monthlyCreditsRaw = String(formData.get('monthlyCredits') ?? '').trim()
        const reason = String(formData.get('premiumAssignReason') ?? '')

        const periodStartIso = periodStartInput
            ? new Date(`${periodStartInput}T00:00:00.000Z`).toISOString()
            : ''
        const periodEndIso = periodEndInput
            ? new Date(`${periodEndInput}T23:59:59.000Z`).toISOString()
            : ''

        const monthlyPriceTry = Number.parseFloat(monthlyPriceRaw)
        const monthlyCredits = Number.parseFloat(monthlyCreditsRaw)

        const result = await adminAssignPremium({
            organizationId: id,
            periodStartIso,
            periodEndIso,
            monthlyPriceTry,
            monthlyCredits,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'assign_premium', result))
    }

    const handleAdjustTrialCredits = async (formData: FormData) => {
        'use server'

        const deltaRaw = String(formData.get('trialCreditDelta') ?? '').trim()
        const reason = String(formData.get('trialCreditReason') ?? '')
        const creditDelta = Number.parseFloat(deltaRaw)

        const result = await adminAdjustTrialCredits({
            organizationId: id,
            creditDelta,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'adjust_trial', result))
    }

    const handleAdjustPackageCredits = async (formData: FormData) => {
        'use server'

        const deltaRaw = String(formData.get('packageCreditDelta') ?? '').trim()
        const reason = String(formData.get('packageCreditReason') ?? '')
        const creditDelta = Number.parseFloat(deltaRaw)

        const result = await adminAdjustPackageCredits({
            organizationId: id,
            creditDelta,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'adjust_package', result))
    }

    const handleCancelPremium = async (formData: FormData) => {
        'use server'

        const reason = String(formData.get('premiumCancelReason') ?? '')
        const result = await adminCancelPremium({
            organizationId: id,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'cancel_premium', result))
    }

    const handleSetMembershipOverride = async (formData: FormData) => {
        'use server'

        const membershipState = String(formData.get('membershipState') ?? '') as BillingMembershipState
        const lockReason = String(formData.get('lockReason') ?? '') as BillingLockReason
        const reason = String(formData.get('membershipOverrideReason') ?? '')

        const result = await adminSetMembershipOverride({
            organizationId: id,
            membershipState,
            lockReason,
            reason
        })

        revalidatePath(`/${locale}/admin/organizations/${id}`)
        redirect(buildBillingActionRedirect(locale, id, 'set_membership', result))
    }

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={tAdmin('organizationDetail.title')}
                breadcrumb={(
                    <Link href="/admin/organizations" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                )}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="w-full space-y-8">
                    <p className="text-gray-500">{tAdmin('organizationDetail.description')}</p>
                    <p className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3 text-sm font-medium text-sky-900">
                        {tAdmin('organizationDetail.manualActions.banner')}
                    </p>

                    {billingActionStatus && (
                        <p
                            className={`rounded-xl border px-4 py-3 text-sm font-medium ${
                                billingActionStatus === 'success'
                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                                    : 'border-rose-200 bg-rose-50 text-rose-900'
                            }`}
                        >
                            {getActionStatusTitle()}
                            {getActionLabel() ? ` • ${getActionLabel()}` : ''}
                            {' — '}
                            {getActionStatusDescription()}
                        </p>
                    )}

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.name')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{details.organization.name}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.slug')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{details.organization.slug}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.created')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatDate.format(new Date(details.organization.createdAt))}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.profiles')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.profileCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.usage')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.totalMessageCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.tokens')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.totalTokenCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.skills')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.skillCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.knowledge')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.knowledgeDocumentCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.storage')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">
                                {formatStorageLabel(details.organization.storageTotalBytes)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {tAdmin('organizationDetail.summary.storageMedia', {
                                    value: formatStorageLabel(details.organization.storageWhatsAppMediaBytes)
                                })}
                            </p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.membership')}</p>
                            <div className="mt-2">
                                <Badge variant={resolveMembershipBadgeVariant(details.organization.billing.membershipState)}>
                                    {resolveMembershipLabel(tAdmin, details.organization.billing)}
                                </Badge>
                            </div>
                            <p className="mt-2 text-xs text-gray-500">
                                {tAdmin('organizationDetail.billing.lockReasonLabel')}: {resolveLockReasonLabel(tAdmin, details.organization.billing)}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.packageCredits')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">
                                {formatNumber.format(details.organization.billing.packageCreditsUsed)} / {formatNumber.format(details.organization.billing.packageCreditsLimit)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {tAdmin('status.remainingLabel', {
                                    value: formatNumber.format(details.organization.billing.packageCreditsRemaining)
                                })}
                            </p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.trialCredits')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">
                                {formatNumber.format(details.organization.billing.trialCreditsUsed)} / {formatNumber.format(details.organization.billing.trialCreditsLimit)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {tAdmin('status.remainingLabel', {
                                    value: formatNumber.format(details.organization.billing.trialCreditsRemaining)
                                })}
                            </p>
                            {details.organization.billing.trialEndsAt && (
                                <p className="mt-1 text-xs text-gray-500">
                                    {tAdmin('organizationDetail.billing.trialEndsAt', {
                                        date: formatDate.format(new Date(details.organization.billing.trialEndsAt))
                                    })}
                                </p>
                            )}
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.topup')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">
                                {formatNumber.format(details.organization.billing.topupCreditsRemaining)}
                            </p>
                            <p className="mt-1 text-xs text-gray-500">
                                {details.organization.billing.isTopupAllowed
                                    ? tAdmin('organizationDetail.billing.topupAllowed')
                                    : tAdmin('organizationDetail.billing.topupBlocked')}
                            </p>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">
                                {tAdmin('organizationDetail.manualActions.title')}
                            </h2>
                            <p className="mt-1 text-sm text-gray-500">
                                {tAdmin('organizationDetail.manualActions.description')}
                            </p>
                        </div>

                        <div className="grid gap-4 md:grid-cols-2">
                            <form action={handleExtendTrial} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.extendTrial.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.extendTrial.newEndDateLabel')}
                                </label>
                                <input
                                    type="date"
                                    name="trialEndsAt"
                                    defaultValue={defaultTrialEndDate}
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                />
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.extendTrial.reasonLabel')}
                                </label>
                                <textarea
                                    name="trialReason"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-[#242A40] px-3 text-xs font-semibold text-white hover:bg-[#1f2437]"
                                >
                                    {tAdmin('organizationDetail.manualActions.extendTrial.submit')}
                                </button>
                            </form>

                            <form action={handleAdjustTopup} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.adjustCredits.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.adjustCredits.deltaLabel')}
                                </label>
                                <input
                                    type="number"
                                    name="creditDelta"
                                    step="0.1"
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                />
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.adjustCredits.reasonLabel')}
                                </label>
                                <textarea
                                    name="creditReason"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-[#242A40] px-3 text-xs font-semibold text-white hover:bg-[#1f2437]"
                                >
                                    {tAdmin('organizationDetail.manualActions.adjustCredits.submit')}
                                </button>
                            </form>

                            <form action={handleAdjustTrialCredits} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.adjustTrialCredits.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.adjustTrialCredits.deltaLabel')}
                                </label>
                                <input
                                    type="number"
                                    name="trialCreditDelta"
                                    step="0.1"
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                />
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.adjustTrialCredits.reasonLabel')}
                                </label>
                                <textarea
                                    name="trialCreditReason"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-[#242A40] px-3 text-xs font-semibold text-white hover:bg-[#1f2437]"
                                >
                                    {tAdmin('organizationDetail.manualActions.adjustTrialCredits.submit')}
                                </button>
                            </form>

                            <form action={handleAdjustPackageCredits} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.adjustPackageCredits.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.adjustPackageCredits.deltaLabel')}
                                </label>
                                <input
                                    type="number"
                                    name="packageCreditDelta"
                                    step="0.1"
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                />
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.adjustPackageCredits.reasonLabel')}
                                </label>
                                <textarea
                                    name="packageCreditReason"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-[#242A40] px-3 text-xs font-semibold text-white hover:bg-[#1f2437]"
                                >
                                    {tAdmin('organizationDetail.manualActions.adjustPackageCredits.submit')}
                                </button>
                            </form>

                            <form action={handleAssignPremium} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.assignPremium.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.assignPremium.periodStartLabel')}
                                </label>
                                <input
                                    type="date"
                                    name="periodStart"
                                    defaultValue={defaultPeriodStartDate}
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                />
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.assignPremium.periodEndLabel')}
                                </label>
                                <input
                                    type="date"
                                    name="periodEnd"
                                    defaultValue={defaultPeriodEndDate}
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                />
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600">
                                            {tAdmin('organizationDetail.manualActions.assignPremium.priceLabel')}
                                        </label>
                                        <input
                                            type="number"
                                            name="monthlyPriceTry"
                                            step="0.01"
                                            min="0"
                                            className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                            required
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-medium text-gray-600">
                                            {tAdmin('organizationDetail.manualActions.assignPremium.creditsLabel')}
                                        </label>
                                        <input
                                            type="number"
                                            name="monthlyCredits"
                                            step="0.1"
                                            min="0"
                                            className="mt-1 h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                            defaultValue={details.organization.billing.packageCreditsLimit}
                                            required
                                        />
                                    </div>
                                </div>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.assignPremium.reasonLabel')}
                                </label>
                                <textarea
                                    name="premiumAssignReason"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-[#242A40] px-3 text-xs font-semibold text-white hover:bg-[#1f2437]"
                                >
                                    {tAdmin('organizationDetail.manualActions.assignPremium.submit')}
                                </button>
                            </form>

                            <form action={handleCancelPremium} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.cancelPremium.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.cancelPremium.reasonLabel')}
                                </label>
                                <textarea
                                    name="premiumCancelReason"
                                    rows={3}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700"
                                >
                                    {tAdmin('organizationDetail.manualActions.cancelPremium.submit')}
                                </button>
                            </form>

                            <form action={handleSetMembershipOverride} className="space-y-3 rounded-lg border border-gray-200 p-4">
                                <h3 className="text-sm font-semibold text-gray-900">
                                    {tAdmin('organizationDetail.manualActions.membershipOverride.title')}
                                </h3>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.membershipOverride.membershipStateLabel')}
                                </label>
                                <select
                                    name="membershipState"
                                    defaultValue={details.organization.billing.membershipState ?? 'trial_active'}
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                >
                                    {membershipStateOptions.map((state) => (
                                        <option key={state} value={state}>
                                            {resolveMembershipStateOptionLabel(tAdmin, state)}
                                        </option>
                                    ))}
                                </select>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.membershipOverride.lockReasonLabel')}
                                </label>
                                <select
                                    name="lockReason"
                                    defaultValue={details.organization.billing.lockReason ?? 'none'}
                                    className="h-10 w-full rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    required
                                >
                                    {lockReasonOptions.map((reason) => (
                                        <option key={reason} value={reason}>
                                            {resolveLockReasonOptionLabel(tAdmin, reason)}
                                        </option>
                                    ))}
                                </select>
                                <label className="block text-xs font-medium text-gray-600">
                                    {tAdmin('organizationDetail.manualActions.membershipOverride.reasonLabel')}
                                </label>
                                <textarea
                                    name="membershipOverrideReason"
                                    rows={2}
                                    className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 outline-none ring-blue-200 focus:ring-2"
                                    placeholder={tAdmin('organizationDetail.manualActions.reasonPlaceholder')}
                                    required
                                />
                                <button
                                    type="submit"
                                    className="inline-flex h-9 items-center rounded-lg bg-[#242A40] px-3 text-xs font-semibold text-white hover:bg-[#1f2437]"
                                >
                                    {tAdmin('organizationDetail.manualActions.membershipOverride.submit')}
                                </button>
                            </form>
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div>
                            <h2 className="text-base font-semibold text-gray-900">{tAdmin('organizationDetail.billingAudit.title')}</h2>
                            <p className="mt-1 text-sm text-gray-500">{tAdmin('organizationDetail.billingAudit.description')}</p>
                        </div>

                        <DataTable>
                            {details.billingAuditEntries.length === 0 ? (
                                <tbody>
                                    <tr>
                                        <td colSpan={4} className="px-6 py-12 text-center">
                                            <div className="mx-auto flex max-w-md flex-col items-center">
                                                <ScrollText className="mb-3 text-gray-300" size={40} />
                                                <p className="text-lg font-medium text-gray-900">
                                                    {tAdmin('organizationDetail.billingAudit.emptyTitle')}
                                                </p>
                                                <p className="mt-1 text-sm text-gray-500">
                                                    {tAdmin('organizationDetail.billingAudit.emptyDescription')}
                                                </p>
                                            </div>
                                        </td>
                                    </tr>
                                </tbody>
                            ) : (
                                <>
                                    <TableHead columns={[
                                        tAdmin('organizationDetail.billingAudit.columns.date'),
                                        tAdmin('organizationDetail.billingAudit.columns.action'),
                                        tAdmin('organizationDetail.billingAudit.columns.actor'),
                                        tAdmin('organizationDetail.billingAudit.columns.reason')
                                    ]} />
                                    <TableBody>
                                        {details.billingAuditEntries.map((entry) => (
                                            <TableRow key={entry.id}>
                                                <TableCell>
                                                    <span className="whitespace-nowrap text-sm text-gray-600">
                                                        {formatDateTime.format(new Date(entry.createdAt))}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm font-medium text-gray-800">
                                                        {resolveBillingAuditActionLabel(tAdmin, entry.actionType)}
                                                    </span>
                                                </TableCell>
                                                <TableCell>
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-gray-800">
                                                            {entry.actorName ?? entry.actorEmail ?? tAdmin('organizationDetail.billingAudit.actorFallback')}
                                                        </p>
                                                        {entry.actorName && entry.actorEmail && (
                                                            <p className="text-xs text-gray-500">{entry.actorEmail}</p>
                                                        )}
                                                    </div>
                                                </TableCell>
                                                <TableCell>
                                                    <span className="text-sm text-gray-700">{entry.reason}</span>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </>
                            )}
                        </DataTable>
                    </div>

                    <DataTable>
                        {details.profiles.length === 0 ? (
                            <tbody>
                                <tr>
                                    <td colSpan={6} className="px-6 py-12 text-center">
                                        <div className="mx-auto flex max-w-md flex-col items-center">
                                            <Users className="mb-3 text-gray-300" size={40} />
                                            <p className="text-lg font-medium text-gray-900">
                                                {tAdmin('organizationDetail.profiles.emptyTitle')}
                                            </p>
                                            <p className="mt-1 text-sm text-gray-500">
                                                {tAdmin('organizationDetail.profiles.emptyDesc')}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        ) : (
                            <>
                                <TableHead columns={[
                                    tAdmin('organizationDetail.profiles.columns.name'),
                                    tAdmin('organizationDetail.profiles.columns.email'),
                                    tAdmin('organizationDetail.profiles.columns.role'),
                                    tAdmin('organizationDetail.profiles.columns.systemAdmin'),
                                    tAdmin('organizationDetail.profiles.columns.organizations'),
                                    tAdmin('organizationDetail.profiles.columns.joined')
                                ]} />
                                <TableBody>
                                    {details.profiles.map((profile) => (
                                        <TableRow key={profile.userId}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">{profile.fullName ?? '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{profile.email ?? '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="info">{profile.role}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {profile.isSystemAdmin ? (
                                                    <Badge variant="purple">{tAdmin('users.roles.systemAdmin')}</Badge>
                                                ) : (
                                                    <Badge variant="neutral">{tAdmin('users.roles.user')}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <p className="text-sm text-gray-700">
                                                        {tAdmin('users.organizationCount', { count: profile.organizationCount })}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {profile.organizations.map((membership) => membership.organizationName).join(', ')}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">{formatDate.format(new Date(profile.joinedAt))}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </>
                        )}
                    </DataTable>
                </div>
            </div>
        </div>
    )
}
