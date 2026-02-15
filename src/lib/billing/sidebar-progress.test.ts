import { describe, expect, it } from 'vitest'

import {
    calculateSidebarBillingProgress,
    calculateSidebarBillingProgressSegments,
    isLowCreditWarningVisible
} from '@/lib/billing/sidebar-progress'

describe('calculateSidebarBillingProgress', () => {
    it('returns full progress for premium users with untouched package credits', () => {
        expect(calculateSidebarBillingProgress({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: 500,
            packageCreditLimit: 500,
            topupBalance: 0
        })).toBe(100)
    })

    it('decreases progress as package credits are consumed', () => {
        expect(calculateSidebarBillingProgress({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: 250,
            packageCreditLimit: 500,
            topupBalance: 0
        })).toBe(50)
    })

    it('uses package + extra balance as total pool for premium users', () => {
        expect(calculateSidebarBillingProgress({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: 200,
            packageCreditLimit: 500,
            topupBalance: 100
        })).toBe(50)
    })
})

describe('calculateSidebarBillingProgressSegments', () => {
    it('returns a single package segment for trial memberships', () => {
        expect(calculateSidebarBillingProgressSegments({
            membershipState: 'trial_active',
            trialRemainingCredits: 30,
            trialCreditLimit: 60,
            packageRemainingCredits: 0,
            packageCreditLimit: 0,
            topupBalance: 0
        })).toEqual({
            packagePercent: 50,
            topupPercent: 0
        })
    })

    it('returns separate package and extra-credit segments for premium memberships', () => {
        const result = calculateSidebarBillingProgressSegments({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: 200,
            packageCreditLimit: 500,
            topupBalance: 100
        })

        expect(result.packagePercent).toBeCloseTo(33.333, 3)
        expect(result.topupPercent).toBeCloseTo(16.667, 3)
    })
})

describe('isLowCreditWarningVisible', () => {
    it('shows warning when remaining trial credits fall below 10 percent', () => {
        expect(isLowCreditWarningVisible({
            membershipState: 'trial_active',
            trialRemainingCredits: 9,
            trialCreditLimit: 100,
            packageRemainingCredits: 0,
            packageCreditLimit: 0,
            topupBalance: 0
        })).toBe(true)
    })

    it('does not show warning when remaining credits are exactly 10 percent', () => {
        expect(isLowCreditWarningVisible({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: 50,
            packageCreditLimit: 500,
            topupBalance: 0
        })).toBe(false)
    })

    it('does not show warning when there are no remaining credits', () => {
        expect(isLowCreditWarningVisible({
            membershipState: 'premium_active',
            trialRemainingCredits: 0,
            trialCreditLimit: 0,
            packageRemainingCredits: 0,
            packageCreditLimit: 500,
            topupBalance: 0
        })).toBe(false)
    })
})
