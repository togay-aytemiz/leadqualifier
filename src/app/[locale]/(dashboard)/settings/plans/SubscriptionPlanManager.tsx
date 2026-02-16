'use client'

import { useEffect, useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { X } from 'lucide-react'
import { createPortal } from 'react-dom'

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
    planAction: (formData: FormData) => void | Promise<void>
    cancelAction: (formData: FormData) => void | Promise<void>
    resumeAction: (formData: FormData) => void | Promise<void>
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
    planAction,
    cancelAction,
    resumeAction
}: SubscriptionPlanManagerProps) {
    const [isClient, setIsClient] = useState(false)
    const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false)
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
    const hasHigherPlan = plans.some((plan) => plan.credits > activePlanCredits)

    useEffect(() => {
        setIsClient(true)
    }, [])

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
                            if (isUpgrade) return tPlans('packageCatalog.planModal.upgrade')
                            if (isDowngrade) return tPlans('packageCatalog.planModal.downgrade')
                            return tPlans('packageCatalog.planModal.switch')
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

                                <form action={planAction} className="mt-4">
                                    <input type="hidden" name="organizationId" value={organizationId} />
                                    <input type="hidden" name="monthlyPriceTry" value={String(plan.priceTry)} />
                                    <input type="hidden" name="monthlyCredits" value={String(plan.credits)} />
                                    <input type="hidden" name="simulatedOutcome" value="success" />
                                    <button
                                        type="submit"
                                        className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                                        disabled={!canManage || isCurrent}
                                    >
                                        {buttonLabel}
                                    </button>
                                </form>
                                {isDowngrade && (
                                    <p className="mt-2 text-[11px] text-gray-500">
                                        {tPlans('packageCatalog.planModal.downgradeHint')}
                                    </p>
                                )}
                            </article>
                        )
                    })}
                </div>
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
            <article className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-2">
                        <p className="text-base font-semibold text-gray-900">
                            {tPlans('packageCatalog.manager.title')}
                        </p>
                        <p className="text-sm text-gray-600">
                            {tPlans('packageCatalog.manager.description')}
                        </p>
                        {!autoRenewEnabled && (
                            <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                                {renewalPeriodEnd
                                    ? tPlans('packageCatalog.manager.cancelScheduledWithDate', {
                                        date: formatDateTime.format(new Date(renewalPeriodEnd))
                                    })
                                    : tPlans('packageCatalog.manager.cancelScheduledNoDate')}
                            </p>
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

                    <div className="flex w-full flex-col gap-2 sm:w-auto">
                        <button
                            type="button"
                            onClick={() => setIsPlanModalOpen(true)}
                            className="inline-flex h-10 min-w-[200px] items-center justify-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
                            disabled={!canManage}
                        >
                            {hasHigherPlan
                                ? tPlans('packageCatalog.manager.manageCtaPrimary')
                                : tPlans('packageCatalog.manager.manageCtaFallback')}
                        </button>

                        {autoRenewEnabled ? (
                            <button
                                type="button"
                                onClick={() => setIsCancelModalOpen(true)}
                                className="inline-flex h-10 min-w-[200px] items-center justify-center rounded-lg border border-gray-300 bg-white px-4 text-sm font-semibold text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:text-gray-500"
                                disabled={!canManage}
                            >
                                {tPlans('packageCatalog.manager.cancelCta')}
                            </button>
                        ) : (
                            <form action={resumeAction}>
                                <input type="hidden" name="organizationId" value={organizationId} />
                                <button
                                    type="submit"
                                    className="inline-flex h-10 min-w-[200px] items-center justify-center rounded-lg border border-[#242A40] bg-white px-4 text-sm font-semibold text-[#242A40] transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:border-gray-300 disabled:bg-gray-100 disabled:text-gray-500"
                                    disabled={!canManage}
                                >
                                    {tPlans('packageCatalog.manager.resumeCta')}
                                </button>
                            </form>
                        )}
                    </div>
                </div>
            </article>

            {isClient && isPlanModalOpen && createPortal(planModal, document.body)}
            {isClient && isCancelModalOpen && createPortal(cancelModal, document.body)}
        </>
    )
}
