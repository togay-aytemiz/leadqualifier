export type SubscriptionCheckoutChangeType =
    | 'new_subscription'
    | 'upgrade'
    | 'downgrade'
    | 'same_plan'

export type SubscriptionCheckoutEffectiveTiming = 'immediate' | 'next_period'
export type SubscriptionCheckoutChargeMode = 'full_price' | 'provider_calculated' | 'no_charge'

export interface CheckoutPlanSnapshot {
    id: string
    credits: number
    localizedPrice: number
}

export interface SubscriptionCheckoutSummary {
    changeType: SubscriptionCheckoutChangeType
    effectiveTiming: SubscriptionCheckoutEffectiveTiming
    chargeMode: SubscriptionCheckoutChargeMode
    monthlyPriceDelta: number
    creditDelta: number
}

export interface SubscriptionCheckoutSummaryDetail {
    label: string
    value: string
    emphasis?: 'strong'
}

export interface SubscriptionCheckoutSavedPaymentMethod {
    type: 'saved_subscription_card'
}

interface SubscriptionCheckoutSummaryDetailLabels {
    currentPlan: string
    newPlan: string
    planValue: (input: { plan: string; price: string }) => string
    effectiveLabel: string
    effectiveImmediate: string
    effectiveNextPeriod: string
    todayChargeLabel: string
    chargeProviderCalculated: string
    chargeNoCharge: string
    chargeFullPrice: (input: { price: string }) => string
    savedPaymentMethodLabel: string
    savedPaymentMethodGeneric: string
    todayCreditDeltaLabel: string
    creditDeltaValue: (input: { credits: string }) => string
    nextRenewalLabel: string
}

interface SubscriptionCheckoutContinueLabelInput {
    summary: SubscriptionCheckoutSummary
    targetPlan: CheckoutPlanSnapshot
    formatCurrency: (value: number) => string
    labels: {
        defaultLabel: string
        chargeLabel: (input: { price: string }) => string
    }
}

export function resolveSubscriptionCheckoutSummary(input: {
    currentPlan: CheckoutPlanSnapshot | null
    targetPlan: CheckoutPlanSnapshot
}): SubscriptionCheckoutSummary {
    if (!input.currentPlan) {
        return {
            changeType: 'new_subscription',
            effectiveTiming: 'immediate',
            chargeMode: 'full_price',
            monthlyPriceDelta: input.targetPlan.localizedPrice,
            creditDelta: input.targetPlan.credits
        }
    }

    const monthlyPriceDelta = input.targetPlan.localizedPrice - input.currentPlan.localizedPrice
    const creditDelta = input.targetPlan.credits - input.currentPlan.credits

    if (input.targetPlan.credits > input.currentPlan.credits) {
        return {
            changeType: 'upgrade',
            effectiveTiming: 'immediate',
            chargeMode: 'provider_calculated',
            monthlyPriceDelta,
            creditDelta
        }
    }

    if (input.targetPlan.credits < input.currentPlan.credits) {
        return {
            changeType: 'downgrade',
            effectiveTiming: 'next_period',
            chargeMode: 'no_charge',
            monthlyPriceDelta,
            creditDelta
        }
    }

    return {
        changeType: 'same_plan',
        effectiveTiming: 'immediate',
        chargeMode: 'no_charge',
        monthlyPriceDelta,
        creditDelta
    }
}

export function buildSubscriptionCheckoutSummaryDetails(input: {
    currentPlan: CheckoutPlanSnapshot | null
    targetPlan: CheckoutPlanSnapshot
    summary: SubscriptionCheckoutSummary
    currentPlanName?: string | null
    targetPlanName: string
    renewalPeriodEnd?: string | null
    savedPaymentMethod?: SubscriptionCheckoutSavedPaymentMethod | null
    formatCurrency: (value: number) => string
    formatCredits: (value: number) => string
    formatRenewalDate: (value: string) => string
    labels: SubscriptionCheckoutSummaryDetailLabels
}): SubscriptionCheckoutSummaryDetail[] {
    const details: SubscriptionCheckoutSummaryDetail[] = []
    const chargeDetail: SubscriptionCheckoutSummaryDetail = {
        label: input.labels.todayChargeLabel,
        value: input.summary.chargeMode === 'provider_calculated'
            ? input.labels.chargeProviderCalculated
            : input.summary.chargeMode === 'no_charge'
                ? input.labels.chargeNoCharge
                : input.labels.chargeFullPrice({
                    price: input.formatCurrency(input.targetPlan.localizedPrice)
                }),
        emphasis: input.summary.chargeMode === 'full_price' ? 'strong' : undefined
    }

    if (input.currentPlan && input.currentPlanName) {
        details.push({
            label: input.labels.currentPlan,
            value: input.labels.planValue({
                plan: input.currentPlanName,
                price: input.formatCurrency(input.currentPlan.localizedPrice)
            })
        })
    }

    details.push({
        label: input.labels.newPlan,
        value: input.labels.planValue({
            plan: input.targetPlanName,
            price: input.formatCurrency(input.targetPlan.localizedPrice)
        })
    })

    details.push({
        label: input.labels.effectiveLabel,
        value: input.summary.effectiveTiming === 'next_period'
            ? input.labels.effectiveNextPeriod
            : input.labels.effectiveImmediate
    })

    if (input.summary.chargeMode === 'no_charge') {
        details.push(chargeDetail)
    }

    if (input.summary.changeType === 'upgrade' && input.savedPaymentMethod) {
        details.push({
            label: input.labels.savedPaymentMethodLabel,
            value: input.labels.savedPaymentMethodGeneric
        })
    }

    if (input.summary.changeType === 'upgrade' && input.summary.creditDelta > 0) {
        details.push({
            label: input.labels.todayCreditDeltaLabel,
            value: input.labels.creditDeltaValue({
                credits: input.formatCredits(input.summary.creditDelta)
            })
        })
    }

    if (input.summary.changeType === 'upgrade' && input.renewalPeriodEnd) {
        details.push({
            label: input.labels.nextRenewalLabel,
            value: input.formatRenewalDate(input.renewalPeriodEnd)
        })
    }

    if (input.summary.chargeMode !== 'no_charge') {
        details.push(chargeDetail)
    }

    return details
}

export function resolveSubscriptionCheckoutContinueLabel(input: SubscriptionCheckoutContinueLabelInput) {
    if (input.summary.chargeMode !== 'full_price') {
        return input.labels.defaultLabel
    }

    if (input.targetPlan.localizedPrice <= 0) {
        return input.labels.defaultLabel
    }

    return input.labels.chargeLabel({
        price: input.formatCurrency(input.targetPlan.localizedPrice)
    })
}
