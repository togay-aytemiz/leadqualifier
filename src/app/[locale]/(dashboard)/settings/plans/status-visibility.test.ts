import { describe, expect, it } from 'vitest'
import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { resolvePremiumStatusVisibility } from './status-visibility'

function createPremiumSnapshot(overrides?: Partial<OrganizationBillingSnapshot>): OrganizationBillingSnapshot {
    return {
        organizationId: 'org_1',
        membershipState: 'premium_active',
        lockReason: 'none',
        isUsageAllowed: true,
        isTopupAllowed: true,
        activeCreditPool: 'topup_pool',
        trial: {
            startedAt: '2026-02-01T00:00:00.000Z',
            endsAt: '2026-02-15T00:00:00.000Z',
            timeProgress: 100,
            remainingDays: 0,
            totalDays: 14,
            credits: {
                limit: 120,
                used: 120,
                remaining: 0,
                progress: 0
            }
        },
        package: {
            periodStart: '2026-03-01T00:00:00.000Z',
            periodEnd: '2026-04-01T00:00:00.000Z',
            credits: {
                limit: 2000,
                used: 80,
                remaining: 1920,
                progress: 96
            }
        },
        topupBalance: 153.5,
        totalRemainingCredits: 2073.5,
        ...overrides
    }
}

describe('resolvePremiumStatusVisibility', () => {
    it('keeps total and extra-credit status cards visible while extra credits remain', () => {
        const visibility = resolvePremiumStatusVisibility({
            snapshot: createPremiumSnapshot(),
            consumedTopupCreditsTotal: 0,
            hasTrialCreditCarryover: false
        })

        expect(visibility.showTotalCreditsCard).toBe(true)
        expect(visibility.showTopupCreditsCard).toBe(true)
        expect(visibility.topupTotalCredits).toBe(153.5)
        expect(visibility.topupCreditsProgress).toBe(100)
    })

    it('includes consumed carryover credits in the displayed extra-credit total', () => {
        const visibility = resolvePremiumStatusVisibility({
            snapshot: createPremiumSnapshot({
                trial: {
                    ...createPremiumSnapshot().trial,
                    credits: {
                        ...createPremiumSnapshot().trial.credits,
                        limit: 200,
                        used: 200
                    }
                }
            }),
            consumedTopupCreditsTotal: 0,
            hasTrialCreditCarryover: true
        })

        expect(visibility.showTotalCreditsCard).toBe(true)
        expect(visibility.showTopupCreditsCard).toBe(true)
        expect(visibility.topupTotalCredits).toBe(200)
        expect(visibility.topupCreditsProgress).toBeCloseTo(76.75, 5)
    })

    it('falls back to consumed topup usage totals when no trial carryover exists', () => {
        const visibility = resolvePremiumStatusVisibility({
            snapshot: createPremiumSnapshot(),
            consumedTopupCreditsTotal: 46.5,
            hasTrialCreditCarryover: false
        })

        expect(visibility.showTotalCreditsCard).toBe(true)
        expect(visibility.showTopupCreditsCard).toBe(true)
        expect(visibility.topupTotalCredits).toBe(200)
        expect(visibility.topupCreditsProgress).toBeCloseTo(76.75, 5)
    })

    it('hides total and extra-credit status cards once extra credits are exhausted', () => {
        const visibility = resolvePremiumStatusVisibility({
            snapshot: createPremiumSnapshot({
                activeCreditPool: 'package_pool',
                topupBalance: 0,
                totalRemainingCredits: 1920
            }),
            consumedTopupCreditsTotal: 46.5,
            hasTrialCreditCarryover: true
        })

        expect(visibility.showTotalCreditsCard).toBe(false)
        expect(visibility.showTopupCreditsCard).toBe(false)
        expect(visibility.topupTotalCredits).toBe(0)
        expect(visibility.topupCreditsProgress).toBe(0)
    })
})
