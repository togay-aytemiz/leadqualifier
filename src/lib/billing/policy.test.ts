import { describe, expect, it } from 'vitest'
import {
    calculateCreditProgress,
    isTopupAllowed,
    isUsageAllowed,
    type BillingMembershipState
} from './policy'

function trialState(): BillingMembershipState {
    return 'trial_active'
}

function premiumState(): BillingMembershipState {
    return 'premium_active'
}

describe('billing policy helpers', () => {
    it('disables top-up during trial', () => {
        expect(
            isTopupAllowed({
                membershipState: trialState(),
                remainingPackageCredits: 0
            })
        ).toBe(false)
    })

    it('enables top-up when premium package credits are still available', () => {
        expect(
            isTopupAllowed({
                membershipState: premiumState(),
                remainingPackageCredits: 12.4
            })
        ).toBe(true)
    })

    it('enables top-up for active premium accounts after package exhaustion', () => {
        expect(
            isTopupAllowed({
                membershipState: premiumState(),
                remainingPackageCredits: 0
            })
        ).toBe(true)
    })

    it('blocks usage when trial is exhausted and premium is not active', () => {
        expect(
            isUsageAllowed({
                membershipState: 'trial_exhausted',
                remainingTrialCredits: 0,
                trialEndsAtIso: '2026-02-01T00:00:00.000Z',
                nowIso: '2026-02-14T00:00:00.000Z',
                remainingPackageCredits: 0,
                topupCredits: 0
            })
        ).toBe(false)
    })

    it('allows usage for active premium users with top-up balance after package exhaustion', () => {
        expect(
            isUsageAllowed({
                membershipState: premiumState(),
                remainingTrialCredits: 0,
                trialEndsAtIso: '2026-02-01T00:00:00.000Z',
                nowIso: '2026-02-14T00:00:00.000Z',
                currentPeriodEndIso: '2026-03-01T00:00:00.000Z',
                remainingPackageCredits: 0,
                topupCredits: 2.5
            })
        ).toBe(true)
    })

    it('blocks premium usage once the current billing period has ended', () => {
        expect(
            isUsageAllowed({
                membershipState: premiumState(),
                remainingTrialCredits: 0,
                trialEndsAtIso: '2026-02-01T00:00:00.000Z',
                nowIso: '2026-03-02T00:00:00.000Z',
                currentPeriodEndIso: '2026-03-01T00:00:00.000Z',
                remainingPackageCredits: 50,
                topupCredits: 10
            })
        ).toBe(false)
    })

    it('keeps premium usage active during the renewal grace window after period end', () => {
        expect(
            isUsageAllowed({
                membershipState: premiumState(),
                remainingTrialCredits: 0,
                trialEndsAtIso: '2026-02-01T00:00:00.000Z',
                nowIso: '2026-03-01T00:30:00.000Z',
                currentPeriodEndIso: '2026-03-01T00:00:00.000Z',
                remainingPackageCredits: 50,
                topupCredits: 10
            })
        ).toBe(true)
    })

    it('calculates clamped credit progress for progress bars', () => {
        expect(calculateCreditProgress({ limit: 120, used: 30 })).toBeCloseTo(25)
        expect(calculateCreditProgress({ limit: 120, used: -10 })).toBe(0)
        expect(calculateCreditProgress({ limit: 120, used: 150 })).toBe(100)
    })
})
