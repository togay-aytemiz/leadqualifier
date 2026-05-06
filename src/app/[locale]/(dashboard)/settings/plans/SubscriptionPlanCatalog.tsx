'use client'

import { useMemo, useState } from 'react'
import { useFormStatus } from 'react-dom'
import { useLocale, useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'
import type { SubscriptionPlanOption } from './SubscriptionPlanManager'

interface SubscriptionPlanCatalogProps {
    organizationId: string
    plans: SubscriptionPlanOption[]
    canSubmit: boolean
    planAction: (formData: FormData) => void | Promise<void>
}

function PurchaseRequestSubmitButton({ disabled }: { disabled: boolean }) {
    const { pending } = useFormStatus()
    const tPlans = useTranslations('billingPlans')

    return (
        <button
            type="submit"
            className="inline-flex h-10 min-w-[120px] items-center justify-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition hover:bg-[#1f2437] disabled:cursor-not-allowed disabled:bg-gray-300"
            disabled={disabled || pending}
        >
            {pending
                ? tPlans('purchaseRequest.modal.submitting')
                : tPlans('purchaseRequest.modal.submit')}
        </button>
    )
}

export function SubscriptionPlanCatalog({
    organizationId,
    plans,
    canSubmit,
    planAction
}: SubscriptionPlanCatalogProps) {
    const locale = useLocale()
    const tPlans = useTranslations('billingPlans')
    const currency = plans[0]?.currency ?? 'TRY'
    const formatNumber = useMemo(
        () => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }),
        [locale]
    )
    const formatCurrency = useMemo(
        () => new Intl.NumberFormat(locale, {
            style: 'currency',
            currency,
            minimumFractionDigits: 0,
            maximumFractionDigits: 2
        }),
        [currency, locale]
    )
    const [checkoutPlanId, setCheckoutPlanId] = useState<string | null>(null)
    const checkoutPlan = plans.find((plan) => plan.id === checkoutPlanId) ?? null
    const isClient = typeof document !== 'undefined'
    const requestModal = checkoutPlan ? (
        <div
            className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setCheckoutPlanId(null)}
        >
            <div
                className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-2xl"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex items-start justify-between gap-3">
                    <div>
                        <h3 className="text-xl font-semibold text-gray-900">
                            {tPlans('purchaseRequest.modal.title')}
                        </h3>
                        <p className="mt-2 text-sm text-gray-600">
                            {tPlans('purchaseRequest.modal.description')}
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={() => setCheckoutPlanId(null)}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-700"
                        aria-label={tPlans('purchaseRequest.modal.close')}
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-700">
                    {tPlans('purchaseRequest.modal.planSummary', {
                        plan: tPlans(`packageCatalog.planNames.${checkoutPlan.id}`),
                        price: formatCurrency.format(checkoutPlan.localizedPrice),
                        credits: formatNumber.format(checkoutPlan.credits)
                    })}
                </div>

                <form action={planAction} className="mt-6 flex justify-end gap-3">
                    <input type="hidden" name="organizationId" value={organizationId} />
                    <input type="hidden" name="requestType" value="plan" />
                    <input type="hidden" name="planId" value={checkoutPlan.id} />
                    <button
                        type="button"
                        onClick={() => setCheckoutPlanId(null)}
                        className="inline-flex h-10 items-center rounded-lg border border-gray-300 px-4 text-sm font-medium text-gray-700 transition hover:bg-gray-100"
                    >
                        {tPlans('purchaseRequest.modal.cancel')}
                    </button>
                    <PurchaseRequestSubmitButton disabled={!canSubmit} />
                </form>
            </div>
        </div>
    ) : null

    return (
        <>
            <div className="grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
                {plans.map((plan) => {
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

                            <div className="mt-auto pt-4">
                                <button
                                    type="button"
                                    onClick={() => setCheckoutPlanId(plan.id)}
                                    className="inline-flex h-10 min-w-[132px] items-center justify-center whitespace-nowrap rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3b4768] disabled:cursor-not-allowed disabled:bg-gray-300"
                                    disabled={!canSubmit}
                                >
                                    {tPlans('packageCatalog.planCta.start')}
                                </button>
                            </div>
                        </article>
                    )
                })}
            </div>
            <p className="mt-3 text-xs text-gray-500">
                {tPlans('packageCatalog.vatIncluded')}
            </p>
            <p className="mt-1 text-xs text-gray-500">
                {tPlans('packageCatalog.conversationRangeDisclaimer')}
            </p>

            {isClient && requestModal && createPortal(requestModal, document.body)}
        </>
    )
}
