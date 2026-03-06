interface PremiumActivationBalancesInput {
    trialCreditLimit: number
    trialCreditUsed: number
    topupCreditBalance: number
    requestedPackageCredits: number
}

export interface PremiumActivationBalances {
    carryoverTrialCredits: number
    nextTrialCreditUsed: number
    nextTopupCreditBalance: number
    totalRemainingCreditsAfterActivation: number
}

function toNonNegativeNumber(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

export function resolvePremiumActivationBalances(
    input: PremiumActivationBalancesInput
): PremiumActivationBalances {
    const trialCreditLimit = toNonNegativeNumber(input.trialCreditLimit)
    const trialCreditUsed = Math.min(trialCreditLimit, toNonNegativeNumber(input.trialCreditUsed))
    const topupCreditBalance = toNonNegativeNumber(input.topupCreditBalance)
    const requestedPackageCredits = toNonNegativeNumber(input.requestedPackageCredits)
    const carryoverTrialCredits = Math.max(0, trialCreditLimit - trialCreditUsed)
    const nextTopupCreditBalance = topupCreditBalance + carryoverTrialCredits

    return {
        carryoverTrialCredits,
        nextTrialCreditUsed: carryoverTrialCredits > 0 ? trialCreditLimit : trialCreditUsed,
        nextTopupCreditBalance,
        totalRemainingCreditsAfterActivation: requestedPackageCredits + nextTopupCreditBalance
    }
}
