import type { BillingMembershipState } from '@/lib/billing/policy'

interface SidebarBillingProgressInput {
    membershipState: BillingMembershipState
    trialRemainingCredits: number
    trialCreditLimit: number
    packageRemainingCredits: number
    packageCreditLimit: number
    topupBalance: number
}

export interface SidebarBillingProgressSegments {
    packagePercent: number
    topupPercent: number
}

export const LOW_CREDIT_WARNING_THRESHOLD_PERCENT = 10

function clampNonNegative(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

function toProgress(remaining: number, total: number) {
    const safeTotal = clampNonNegative(total)
    if (safeTotal <= 0) return 0
    const safeRemaining = Math.min(clampNonNegative(remaining), safeTotal)
    return (safeRemaining / safeTotal) * 100
}

export function calculateSidebarBillingProgress(input: SidebarBillingProgressInput) {
    if (input.membershipState === 'trial_active' || input.membershipState === 'trial_exhausted') {
        return toProgress(input.trialRemainingCredits, input.trialCreditLimit)
    }

    if (input.membershipState === 'premium_active') {
        const remaining = clampNonNegative(input.packageRemainingCredits) + clampNonNegative(input.topupBalance)
        const total = clampNonNegative(input.packageCreditLimit) + clampNonNegative(input.topupBalance)
        return toProgress(remaining, total)
    }

    return 0
}

export function calculateSidebarBillingProgressSegments(input: SidebarBillingProgressInput): SidebarBillingProgressSegments {
    const totalProgress = calculateSidebarBillingProgress(input)
    if (totalProgress <= 0) {
        return {
            packagePercent: 0,
            topupPercent: 0
        }
    }

    if (input.membershipState === 'premium_active') {
        const packageRemaining = clampNonNegative(input.packageRemainingCredits)
        const topupRemaining = clampNonNegative(input.topupBalance)
        const totalRemaining = packageRemaining + topupRemaining

        if (totalRemaining <= 0) {
            return {
                packagePercent: 0,
                topupPercent: 0
            }
        }

        return {
            packagePercent: (totalProgress * packageRemaining) / totalRemaining,
            topupPercent: (totalProgress * topupRemaining) / totalRemaining
        }
    }

    return {
        packagePercent: totalProgress,
        topupPercent: 0
    }
}

export function isLowCreditWarningVisible(
    input: SidebarBillingProgressInput,
    thresholdPercent: number = LOW_CREDIT_WARNING_THRESHOLD_PERCENT
) {
    const normalizedThreshold = Number.isFinite(thresholdPercent)
        ? Math.max(0, thresholdPercent)
        : LOW_CREDIT_WARNING_THRESHOLD_PERCENT

    const progress = calculateSidebarBillingProgress(input)
    return progress > 0 && progress < normalizedThreshold
}
