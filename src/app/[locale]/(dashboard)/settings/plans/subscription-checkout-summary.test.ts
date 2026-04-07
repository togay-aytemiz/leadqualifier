import { describe, expect, it } from 'vitest'
import {
    buildSubscriptionCheckoutSummaryDetails,
    resolveSubscriptionCheckoutContinueLabel,
    resolveSubscriptionCheckoutSummary
} from './subscription-checkout-summary'

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
        expect(summary.creditDelta).toBe(1000)
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

    it('builds provider-calculated popup details for immediate upgrades', () => {
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

        const details = buildSubscriptionCheckoutSummaryDetails({
            currentPlan: {
                id: 'starter',
                credits: 1000,
                localizedPrice: 349
            },
            targetPlan: {
                id: 'growth',
                credits: 2000,
                localizedPrice: 649
            },
            summary,
            currentPlanName: 'Temel',
            targetPlanName: 'Gelişmiş',
            renewalPeriodEnd: '2026-05-01T00:00:00.000Z',
            formatCurrency: (value) => `₺${value}`,
            formatCredits: (value) => String(value),
            formatRenewalDate: (value) => value.slice(0, 10),
            savedPaymentMethod: {
                type: 'saved_subscription_card'
            },
            labels: {
                currentPlan: 'Mevcut plan',
                newPlan: 'Yeni plan',
                planValue: ({ plan, price }) => `${plan} • ${price} / ay`,
                effectiveLabel: 'Geçiş zamanı',
                effectiveImmediate: 'Hemen uygulanır.',
                effectiveNextPeriod: 'Bir sonraki dönem başında uygulanır.',
                todayChargeLabel: 'Bugünkü tahsilat',
                chargeProviderCalculated: 'Tutar Iyzico tarafından hesaplanır.',
                chargeNoCharge: 'Bugün yeni tahsilat yapılmaz.',
                chargeFullPrice: ({ price }) => `Bugün ${price} tahsil edilir.`,
                savedPaymentMethodLabel: 'Ödeme yöntemi',
                savedPaymentMethodGeneric: 'Tahsilat kayıtlı kartınızdan alınır.',
                todayCreditDeltaLabel: 'Bugün açılacak ek hak',
                creditDeltaValue: ({ credits }) => `+${credits} kredi`,
                nextRenewalLabel: 'Bir sonraki yenileme'
            }
        })

        expect(details).toEqual([
            { label: 'Mevcut plan', value: 'Temel • ₺349 / ay' },
            { label: 'Yeni plan', value: 'Gelişmiş • ₺649 / ay' },
            { label: 'Geçiş zamanı', value: 'Hemen uygulanır.' },
            { label: 'Ödeme yöntemi', value: 'Tahsilat kayıtlı kartınızdan alınır.' },
            { label: 'Bugün açılacak ek hak', value: '+1000 kredi' },
            { label: 'Bir sonraki yenileme', value: '2026-05-01' },
            { label: 'Bugünkü tahsilat', value: 'Tutar Iyzico tarafından hesaplanır.' }
        ])
    })

    it('keeps saved-card messaging generic even if masked digits are available later', () => {
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

        const details = buildSubscriptionCheckoutSummaryDetails({
            currentPlan: {
                id: 'starter',
                credits: 1000,
                localizedPrice: 349
            },
            targetPlan: {
                id: 'growth',
                credits: 2000,
                localizedPrice: 649
            },
            summary,
            currentPlanName: 'Temel',
            targetPlanName: 'Gelişmiş',
            renewalPeriodEnd: '2026-05-01T00:00:00.000Z',
            formatCurrency: (value) => `₺${value}`,
            formatCredits: (value) => String(value),
            formatRenewalDate: (value) => value.slice(0, 10),
            savedPaymentMethod: {
                type: 'saved_subscription_card'
            },
            labels: {
                currentPlan: 'Mevcut plan',
                newPlan: 'Yeni plan',
                planValue: ({ plan, price }) => `${plan} • ${price} / ay`,
                effectiveLabel: 'Geçiş zamanı',
                effectiveImmediate: 'Hemen uygulanır.',
                effectiveNextPeriod: 'Bir sonraki dönem başında uygulanır.',
                todayChargeLabel: 'Bugünkü tahsilat',
                chargeProviderCalculated: 'Tutar Iyzico tarafından hesaplanır.',
                chargeNoCharge: 'Bugün yeni tahsilat yapılmaz.',
                chargeFullPrice: ({ price }) => `Bugün ${price} tahsil edilir.`,
                savedPaymentMethodLabel: 'Ödeme yöntemi',
                savedPaymentMethodGeneric: 'Tahsilat kayıtlı kartınızdan alınır.',
                todayCreditDeltaLabel: 'Bugün açılacak ek hak',
                creditDeltaValue: ({ credits }) => `+${credits} kredi`,
                nextRenewalLabel: 'Bir sonraki yenileme'
            }
        })

        expect(details).toContainEqual({
            label: 'Ödeme yöntemi',
            value: 'Tahsilat kayıtlı kartınızdan alınır.'
        })
    })

    it('keeps provider-calculated upgrade CTAs neutral instead of quoting a local delta', () => {
        const summary = resolveSubscriptionCheckoutSummary({
            currentPlan: {
                id: 'starter',
                credits: 1000,
                localizedPrice: 649
            },
            targetPlan: {
                id: 'scale',
                credits: 4000,
                localizedPrice: 949
            }
        })

        const label = resolveSubscriptionCheckoutContinueLabel({
            summary,
            targetPlan: {
                id: 'scale',
                credits: 4000,
                localizedPrice: 949
            },
            formatCurrency: (value) => `₺${value}`,
            labels: {
                defaultLabel: 'Plan değişikliğini uygula',
                chargeLabel: ({ price }) => `${price} ödeme yap`
            }
        })

        expect(label).toBe('Plan değişikliğini uygula')
    })
})
