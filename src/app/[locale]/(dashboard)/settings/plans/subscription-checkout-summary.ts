export type SubscriptionCheckoutChangeType =
    | 'new_subscription'
    | 'upgrade'
    | 'downgrade'
    | 'same_plan'

export type SubscriptionCheckoutEffectiveTiming = 'immediate' | 'next_period'
export type SubscriptionCheckoutChargeMode = 'full_price' | 'provider_calculated' | 'no_charge'

interface CheckoutPlanSnapshot {
    id: string
    credits: number
    localizedPrice: number
}

export interface SubscriptionCheckoutSummary {
    changeType: SubscriptionCheckoutChangeType
    effectiveTiming: SubscriptionCheckoutEffectiveTiming
    chargeMode: SubscriptionCheckoutChargeMode
    monthlyPriceDelta: number
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
            monthlyPriceDelta: input.targetPlan.localizedPrice
        }
    }

    const monthlyPriceDelta = input.targetPlan.localizedPrice - input.currentPlan.localizedPrice

    if (input.targetPlan.credits > input.currentPlan.credits) {
        return {
            changeType: 'upgrade',
            effectiveTiming: 'immediate',
            chargeMode: 'provider_calculated',
            monthlyPriceDelta
        }
    }

    if (input.targetPlan.credits < input.currentPlan.credits) {
        return {
            changeType: 'downgrade',
            effectiveTiming: 'next_period',
            chargeMode: 'no_charge',
            monthlyPriceDelta
        }
    }

    return {
        changeType: 'same_plan',
        effectiveTiming: 'immediate',
        chargeMode: 'no_charge',
        monthlyPriceDelta
    }
}
