import { describe, expect, it } from 'vitest'
import { resolvePremiumActivationBalances } from './premium-activation'

describe('resolvePremiumActivationBalances', () => {
    it('moves remaining trial credits into persistent carryover balance on first premium activation', () => {
        expect(resolvePremiumActivationBalances({
            trialCreditLimit: 200,
            trialCreditUsed: 100,
            topupCreditBalance: 0,
            requestedPackageCredits: 1000
        })).toEqual({
            carryoverTrialCredits: 100,
            nextTrialCreditUsed: 200,
            nextTopupCreditBalance: 100,
            totalRemainingCreditsAfterActivation: 1100
        })
    })

    it('keeps existing extra-credit balance unchanged when no trial credits remain', () => {
        expect(resolvePremiumActivationBalances({
            trialCreditLimit: 200,
            trialCreditUsed: 200,
            topupCreditBalance: 40,
            requestedPackageCredits: 1000
        })).toEqual({
            carryoverTrialCredits: 0,
            nextTrialCreditUsed: 200,
            nextTopupCreditBalance: 40,
            totalRemainingCreditsAfterActivation: 1040
        })
    })
})
