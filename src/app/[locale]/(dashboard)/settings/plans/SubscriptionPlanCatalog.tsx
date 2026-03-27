'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState } from 'react'
import { useLocale, useTranslations } from 'next-intl'
import { createPortal } from 'react-dom'
import type { SubscriptionPlanOption } from './SubscriptionPlanManager'

const CheckoutLegalConsentModal = dynamic(() => import('./CheckoutLegalConsentModal').then((module) => module.CheckoutLegalConsentModal), {
    loading: () => null
})

interface SubscriptionPlanCatalogProps {
    organizationId: string
    plans: SubscriptionPlanOption[]
    canSubmit: boolean
    planAction: (formData: FormData) => void | Promise<void>
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
                                    className="inline-flex h-10 min-w-[132px] items-center justify-center rounded-lg bg-[#242A40] px-4 text-sm font-semibold text-white transition-colors hover:bg-[#3b4768] disabled:cursor-not-allowed disabled:bg-gray-300"
                                    disabled={!canSubmit}
                                >
                                    {tPlans('packageCatalog.planCta.start')}
                                </button>
                            </div>
                        </article>
                    )
                })}
            </div>

            {isClient && checkoutPlan && createPortal(
                <CheckoutLegalConsentModal
                    flowType="subscription"
                    summary={tPlans('checkoutLegal.subscriptionSummary', {
                        plan: tPlans(`packageCatalog.planNames.${checkoutPlan.id}`),
                        price: formatCurrency.format(checkoutPlan.localizedPrice),
                        credits: formatNumber.format(checkoutPlan.credits)
                    })}
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
