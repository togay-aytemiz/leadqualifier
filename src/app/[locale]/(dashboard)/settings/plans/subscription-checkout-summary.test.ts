import { describe, expect, it } from 'vitest'
import { resolveSubscriptionCheckoutSummary } from './subscription-checkout-summary'

describe('resolveSubscriptionCheckoutSummary', () => {
    it('treats a first subscription as an immediate full-price checkout', () => {
        const summary = resolveSubscriptionCheckoutSummary({
            currentPlan: null,
            targetPlan: {
                id: 'starter',
                credits: 1000,
                localizedPrice: 349
            }
        })

        expect(summary.changeType).toBe('new_subscription')
        expect(summary.effectiveTiming).toBe('immediate')
        expect(summary.chargeMode).toBe('full_price')
    })

    it('treats higher-tier changes as immediate upgrades with provider-calculated charging', () => {
        const summary = resolveSubscriptionCheckoutSummary({
            currentPlan: {
                id: 'starter',
                credits: 1000,
                localizedPrice: 349
            },
            targetPlan: {
                id: 'growth',
                credits: 2000,
                localizedPrice: 649
            }
        })

        expect(summary.changeType).toBe('upgrade')
        expect(summary.effectiveTiming).toBe('immediate')
        expect(summary.chargeMode).toBe('provider_calculated')
        expect(summary.monthlyPriceDelta).toBe(300)
    })

    it('treats lower-tier changes as next-period downgrades with no charge today', () => {
        const summary = resolveSubscriptionCheckoutSummary({
            currentPlan: {
                id: 'growth',
                credits: 2000,
                localizedPrice: 649
            },
            targetPlan: {
                id: 'starter',
                credits: 1000,
                localizedPrice: 349
            }
        })

        expect(summary.changeType).toBe('downgrade')
        expect(summary.effectiveTiming).toBe('next_period')
        expect(summary.chargeMode).toBe('no_charge')
        expect(summary.monthlyPriceDelta).toBe(-300)
    })
})
