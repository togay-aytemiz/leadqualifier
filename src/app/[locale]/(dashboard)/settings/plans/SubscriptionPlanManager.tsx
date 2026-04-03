'use client'

import dynamic from 'next/dynamic'
import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'
import {
    buildSubscriptionCheckoutSummaryDetails,
    resolveSubscriptionCheckoutContinueLabel,
    resolveSubscriptionCheckoutSummary
} from './subscription-checkout-summary'

const CheckoutLegalConsentModal = dynamic(() => import('./CheckoutLegalConsentModal').then((module) => module.CheckoutLegalConsentModal), {
    loading: () => null
})

interface PlanConversationRange {
    min: number
    max: number
}

export interface SubscriptionPlanOption {
    id: string
    credits: number
    priceTry: number
    localizedPrice: number
    currency: 'TRY' | 'USD'
    conversationRange: PlanConversationRange
    unitPrice: number
}

interface SubscriptionPlanManagerProps {
    organizationId: string
    plans: SubscriptionPlanOption[]
    activePlanId: string | null
    activePlanCredits: number
    canManage: boolean
    autoRenewEnabled: boolean
    renewalPeriodEnd: string | null
    pendingPlanId: string | null
    pendingPlanName: string | null
    pendingPlanEffectiveAt: string | null
    supportsAutoRenewResume: boolean
    paymentRecoveryState?: {
        canRetry: boolean
        canUpdateCard: boolean
    } | null
    planAction: (formData: FormData) => void | Promise<void>
    cancelAction: (formData: FormData) => void | Promise<void>
    retryPaymentAction?: (formData: FormData) => void | Promise<void>
    updatePaymentMethodAction?: (formData: FormData) => void | Promise<void>
}

export function SubscriptionPlanManager({
    organizationId,
    plans,
    activePlanId,
    activePlanCredits,
    canManage,
    autoRenewEnabled,
    renewalPeriodEnd,
    pendingPlanId,
    pendingPlanName,
    pendingPlanEffectiveAt,
    supportsAutoRenewResume,
    paymentRecoveryState,
    planAction,
    cancelAction,
    retryPaymentAction,
    updatePaymentMethodAction
}: SubscriptionPlanManagerProps) {
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
    const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null)
    const locale = useLocale()
    const tPlans = useTranslations('billingPlans')

    const formatNumber = useMemo(
        () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
        [locale]
    )
    const currency = plans[0]?.currency ?? 'TRY'
    const formatCurrency = useMemo(
        () => new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }),
        [currency, locale]
    )
    const formatDateTime = useMemo(
        () => new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }),
        [locale]
    )
    const formatDate = useMemo(
        () => new Intl.DateTimeFormat(locale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        }),
        [locale]
    )
    const hasHigherPlan = plans.some((plan) => plan.credits > activePlanCredits)
    const activePlan = plans.find((plan) => plan.id === activePlanId) ?? null
    const activePlanName = activePlan
        ? tPlans(`packageCatalog.planNames.${activePlan.id}`)
        : tPlans('status.currentPackageUnknown')
    const checkoutPlan = plans.find((plan) => plan.id === checkoutPlanId) ?? null
    const checkoutSummary = checkoutPlan
        ? resolveSubscriptionCheckoutSummary({
            currentPlan: activePlan
                ? {
                    id: activePlan.id,
                    credits: activePlan.credits,
                    localizedPrice: activePlan.localizedPrice
                }
                : null,
            targetPlan: {
                id: checkoutPlan.id,
                credits: checkoutPlan.credits,
                localizedPrice: checkoutPlan.localizedPrice
            }
        })
        : null
    const checkoutSummaryDetails = checkoutPlan && checkoutSummary
        ? buildSubscriptionCheckoutSummaryDetails({
            currentPlan: activePlan
                ? {
                    id: activePlan.id,
                    credits: activePlan.credits,
                    localizedPrice: activePlan.localizedPrice
                }
                : null,
            targetPlan: {
                id: checkoutPlan.id,
                credits: checkoutPlan.credits,
                localizedPrice: checkoutPlan.localizedPrice
            },
            summary: checkoutSummary,
            currentPlanName: activePlan
                ? tPlans(`packageCatalog.planNames.${activePlan.id}`)
                : null,
            targetPlanName: tPlans(`packageCatalog.planNames.${checkoutPlan.id}`),
            renewalPeriodEnd,
            savedPaymentMethod: checkoutSummary.changeType === 'upgrade'
                ? {
                    type: 'saved_subscription_card'
                }
                : null,
            formatCurrency: (value) => formatCurrency.format(value),
            formatCredits: (value) => formatNumber.format(value),
            formatRenewalDate: (value) => formatDate.format(new Date(value)),
            labels: {
                currentPlan: tPlans('checkoutLegal.details.currentPlan'),
                newPlan: tPlans('checkoutLegal.details.newPlan'),
                planValue: ({ plan, price }) => tPlans('checkoutLegal.details.planValue', { plan, price }),
                effectiveLabel: tPlans('checkoutLegal.details.effectiveLabel'),
                effectiveImmediate: tPlans('checkoutLegal.details.effectiveImmediate'),
                effectiveNextPeriod: tPlans('checkoutLegal.details.effectiveNextPeriod'),
                todayChargeLabel: tPlans('checkoutLegal.details.todayChargeLabel'),
                chargeFullDelta: ({ price }) => tPlans('checkoutLegal.details.chargeFullDelta', { price }),
                chargeNoCharge: tPlans('checkoutLegal.details.chargeNoCharge'),
                chargeFullPrice: ({ price }) => tPlans('checkoutLegal.details.chargeFullPrice', { price }),
                savedPaymentMethodLabel: tPlans('checkoutLegal.details.savedPaymentMethodLabel'),
                savedPaymentMethodGeneric: tPlans('checkoutLegal.details.savedPaymentMethodGeneric'),
                todayCreditDeltaLabel: tPlans('checkoutLegal.details.todayCreditDeltaLabel'),
                creditDeltaValue: ({ credits }) => tPlans('checkoutLegal.details.creditDeltaValue', { credits }),
                nextRenewalLabel: tPlans('checkoutLegal.details.nextRenewalLabel')
            }
        })
        : []
    const checkoutContinueLabel = checkoutPlan && checkoutSummary
        ? resolveSubscriptionCheckoutContinueLabel({
            summary: checkoutSummary,
            targetPlan: {
                id: checkoutPlan.id,
                credits: checkoutPlan.credits,
                localizedPrice: checkoutPlan.localizedPrice
            },
            formatCurrency: (value) => formatCurrency.format(value),
            labels: {
                defaultLabel: tPlans('checkoutLegal.continueDirectAction'),
                chargeLabel: ({ price }) => tPlans('checkoutLegal.continueDirectActionWithCharge', { price })
            }
        })
        : tPlans('checkoutLegal.continueDirectAction')
    const canRenderPortal = typeof document !== 'undefined'
    const openCancelFromPlanModal = () => {
        setIsPlanModalOpen(false)
        setIsCancelModalOpen(true)
    }

    useEffect(() => {
        if (!isPlanModalOpen && !isCancelModalOpen) return

        const onKeyDown = (event: KeyboardEvent) => {
            if (event.key !== 'Escape') return
            setIsPlanModalOpen(false)
            setIsCancelModalOpen(false)
        }

        window.addEventListener('keydown', onKeyDown)
        return () => window.removeEventListener('keydown', onKeyDown)
    }, [isPlanModalOpen, isCancelModalOpen])

    useEffect(() => {
        if (!isPlanModalOpen && !isCancelModalOpen) return
        const previousOverflow = document.body.style.overflow
        document.body.style.overflow = 'hidden'
        return () => {
            document.body.style.overflow = previousOverflow
        }
    }, [isCancelModalOpen, isPlanModalOpen])

    const planModal = (
        <div
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setIsPlanModalOpen(false)}
        >
            <div
                className="w-full max-w-5xl rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                            {tPlans('packageCatalog.planModal.title')}
                        </h3>
                        <p className="mt-1 text-sm text-gray-600">
                            {tPlans('packageCatalog.planModal.description')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setIsPlanModalOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={tPlans('packageCatalog.planModal.close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
                    {plans.map((plan) => {
                        const isCurrent = activePlanId === plan.id
                        const isPending = pendingPlanId === plan.id
                        const isUpgrade = !isCurrent && plan.credits > activePlanCredits
                        const isDowngrade = !isCurrent && plan.credits < activePlanCredits
                        const buttonLabel = (() => {
                            if (isCurrent) return tPlans('packageCatalog.planModal.current')
                            if (isUpgrade) return tPlans('packageCatalog.planModal.upgradeContinue')
                            if (isDowngrade) return tPlans('packageCatalog.planModal.downgradeContinue')
                            return tPlans('packageCatalog.planModal.switchContinue')
                        })()

                        return (
                            <article
                                key={plan.id}
                                className={`flex h-full flex-col rounded-2xl border bg-white p-5 shadow-sm ${
                                    isCurrent
                                        ? 'border-[#242A40]'
                                        : isPending
                                            ? 'border-amber-300'
                                            : 'border-gray-200'
                                }`}
                            >
                                <div className="mb-4 flex min-h-7 items-center justify-between gap-2">
                                    <p className="text-sm font-semibold text-gray-900">
                                        {tPlans(`packageCatalog.planNames.${plan.id}`)}
                                    </p>
                                    {isCurrent && (
                                        <p className="rounded-full bg-[#242A40] px-2.5 py-1 text-[11px] font-semibold text-white">
                                            {tPlans('packageCatalog.planModal.current')}
                                        </p>
                                    )}
                                    {!isCurrent && isPending && (
                                        <p className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">
                                            {tPlans('packageCatalog.badges.scheduled')}
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

                                <div className="mt-4">
                                    <button
                                        type="button"
                                        onClick={() => setCheckoutPlanId(plan.id)}
                                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3b4768] disabled:cursor-not-allowed disabled:bg-gray-300"
                                        disabled={!canManage || isCurrent}
                                    >
                                        {buttonLabel}
                                    </button>
                                </div>
                                {isDowngrade && (
                                    <p className="mt-2 text-[11px] text-amber-700">
                                        {tPlans('packageCatalog.planModal.downgradeHint')}
                                    </p>
                                )}
                            </article>
                        )
                    })}
                </div>
                <p className="mt-4 text-xs text-gray-500">
                    {tPlans('packageCatalog.vatIncluded')}
                </p>
                <p className="mt-1 text-xs text-gray-500">
                    {tPlans('packageCatalog.conversationRangeDisclaimer')}
                </p>

                {autoRenewEnabled && (
                    <div className="mt-5 border-t border-gray-200 pt-4 text-sm text-gray-500">
                        <span>{tPlans('packageCatalog.planModal.cancelHintPrefix')}</span>
                        {' '}
                        <button
                            type="button"
                            onClick={openCancelFromPlanModal}
                            className="font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition hover:text-gray-900 hover:decoration-gray-500 disabled:cursor-not-allowed disabled:text-gray-400"
                            disabled={!canManage}
                        >
                            {tPlans('packageCatalog.planModal.cancelHintAction')}
                        </button>
                    </div>
                )}
            </div>
        </div>
    )

    const cancelModal = (
        <div
            className="fixed inset-0 z-[220] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setIsCancelModalOpen(false)}
        >
            <div
                className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <h3 className="text-xl font-semibold text-gray-900">
                        {tPlans('packageCatalog.cancelModal.title')}
                    </h3>
                    <button
                        type="button"
                        onClick={() => setIsCancelModalOpen(false)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={tPlans('packageCatalog.cancelModal.close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <p className="mt-2 text-sm text-gray-600">
                    {renewalPeriodEnd
                        ? tPlans('packageCatalog.cancelModal.descriptionWithDate', {
                            date: formatDateTime.format(new Date(renewalPeriodEnd))
                        })
                        : tPlans('packageCatalog.cancelModal.descriptionNoDate')}
                </p>

                <div className="mt-6 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={() => setIsCancelModalOpen(false)}
                        className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                        {tPlans('packageCatalog.cancelModal.keep')}
                    </button>

                    <form action={cancelAction}>
                        <input type="hidden" name="organizationId" value={organizationId} />
                        <button
                            type="submit"
                            className="inline-flex h-10 items-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                            disabled={!canManage}
                        >
                            {tPlans('packageCatalog.cancelModal.confirm')}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    )

    return (
        <>
            <article className="rounded-2xl border border-gray-200 bg-white p-5">
                <div className="flex flex-col gap-5">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div>
                            <p className="text-xs uppercase tracking-wider text-gray-400">
                                {tPlans('packageCatalog.currentPackageLabel')}
                            </p>
                            <p className="mt-2 text-2xl font-semibold text-gray-900">
                                {activePlanName}
                            </p>
                            {activePlan && (
                                <>
                                    <p className="mt-4 text-sm text-gray-700">
                                        {tPlans('packageCatalog.packageCreditsValue', {
                                            credits: formatNumber.format(activePlan.credits)
                                        })}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-600">
                                        {tPlans('packageCatalog.approxConversations', {
                                            min: formatNumber.format(activePlan.conversationRange.min),
                                            max: formatNumber.format(activePlan.conversationRange.max)
                                        })}
                                    </p>
                                    <p className="mt-1 text-xs text-gray-500">
                                        {tPlans('packageCatalog.unitPrice', {
                                            price: formatCurrency.format(activePlan.unitPrice)
                                        })}
                                    </p>
                                </>
                            )}
                        </div>

                        {activePlan && (
                            <p className="tabular-nums text-4xl font-semibold leading-tight text-gray-900 md:text-right">
                                {formatCurrency.format(activePlan.localizedPrice)}
                                <span className="ml-1 text-base font-medium text-gray-500">
                                    / {tPlans('packageCatalog.month')}
                                </span>
                            </p>
                        )}
                    </div>
                    {activePlan && (
                        <p className="text-xs text-gray-500">
                            {tPlans('packageCatalog.vatIncluded')}
                        </p>
                    )}
                    {activePlan && (
                        <p className="mt-1 text-xs text-gray-500">
                            {tPlans('packageCatalog.conversationRangeDisclaimer')}
                        </p>
                    )}

                    {(!autoRenewEnabled || pendingPlanName) && (
                        <div className="space-y-2">
                            {!autoRenewEnabled && (
                                <>
                                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                        {renewalPeriodEnd
                                            ? tPlans('packageCatalog.manager.cancelScheduledWithDate', {
                                                date: formatDateTime.format(new Date(renewalPeriodEnd))
                                            })
                                            : tPlans('packageCatalog.manager.cancelScheduledNoDate')}
                                    </p>
                                    {!supportsAutoRenewResume && (
                                        <p className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-700">
                                            {tPlans('packageCatalog.manager.resumeUnavailable')}
                                        </p>
                                    )}
                                </>
                            )}
                            {pendingPlanName && (
                                <p className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                                    {pendingPlanEffectiveAt
                                        ? tPlans('packageCatalog.manager.pendingPlanWithDate', {
                                            plan: pendingPlanName,
                                            date: formatDateTime.format(new Date(pendingPlanEffectiveAt))
                                        })
                                        : tPlans('packageCatalog.manager.pendingPlanNoDate', {
                                            plan: pendingPlanName
                                        })}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="border-t border-gray-200 pt-4">
                        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
                            <button
                                type="button"
                                onClick={() => setIsPlanModalOpen(true)}
                                className="inline-flex items-center font-medium text-[#242A40] underline decoration-[#242A40]/30 underline-offset-4 transition hover:text-[#1f2437] hover:decoration-[#1f2437]/40 disabled:cursor-not-allowed disabled:text-gray-400"
                                disabled={!canManage}
                            >
                                {hasHigherPlan
                                    ? tPlans('packageCatalog.manager.manageCtaPrimary')
                                    : tPlans('packageCatalog.manager.manageCtaFallback')}
                            </button>

                            {paymentRecoveryState?.canUpdateCard && updatePaymentMethodAction ? (
                                <form action={updatePaymentMethodAction}>
                                    <input type="hidden" name="organizationId" value={organizationId} />
                                    <button
                                        type="submit"
                                        className="inline-flex items-center font-medium text-gray-600 underline decoration-gray-300 underline-offset-4 transition hover:text-gray-900 hover:decoration-gray-500 disabled:cursor-not-allowed disabled:text-gray-400"
                                        disabled={!canManage}
                                    >
                                        {tPlans('packageCatalog.manager.updatePaymentMethodCta')}
                                    </button>
                                </form>
                            ) : null}

                            {paymentRecoveryState?.canRetry && retryPaymentAction ? (
                                <form action={retryPaymentAction}>
                                    <input type="hidden" name="organizationId" value={organizationId} />
                                    <button
                                        type="submit"
                                        className="inline-flex items-center font-medium text-gray-700 underline decoration-gray-300 underline-offset-4 transition hover:text-gray-900 hover:decoration-gray-500 disabled:cursor-not-allowed disabled:text-gray-400"
                                        disabled={!canManage}
                                    >
                                        {tPlans('packageCatalog.manager.retryPaymentCta')}
                                    </button>
                                </form>
                            ) : null}
                        </div>
                    </div>
                </div>
            </article>

            {canRenderPortal && isPlanModalOpen && createPortal(planModal, document.body)}
            {canRenderPortal && isCancelModalOpen && createPortal(cancelModal, document.body)}
            {canRenderPortal && checkoutPlan && createPortal(
                <CheckoutLegalConsentModal
                    flowType="subscription"
                    consentVariant="plan_change"
                    title={tPlans('checkoutLegal.titleDirectAction')}
                    description={tPlans('checkoutLegal.descriptionDirectAction')}
                    summary={tPlans('checkoutLegal.subscriptionSummary', {
                        plan: tPlans(`packageCatalog.planNames.${checkoutPlan.id}`),
                        price: formatCurrency.format(checkoutPlan.localizedPrice),
                        credits: formatNumber.format(checkoutPlan.credits)
                    })}
                    summaryDetails={checkoutSummaryDetails}
                    continueLabel={checkoutContinueLabel}
                    immediateStartLabel={tPlans('checkoutLegal.acceptPlanChange')}
                    secondaryAction={checkoutSummary?.changeType === 'upgrade' && paymentRecoveryState?.canUpdateCard && updatePaymentMethodAction
                        ? {
                            label: tPlans('checkoutLegal.updatePaymentMethodInlineAction'),
                            action: updatePaymentMethodAction,
                            hiddenFields: [
                                { name: 'organizationId', value: organizationId }
                            ]
                        }
                        : undefined}
                    action={planAction}
                    hiddenFields={[
                        { name: 'organizationId', value: organizationId },
                        { name: 'planId', value: checkoutPlan.id }
                    ]}
                    onClose={() => setCheckoutPlanId(null)}
                />,
                document.body
            )}
        </>
    )
}
