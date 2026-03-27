import type { OrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import { resolveTopupCreditsTotal } from '@/lib/billing/topup-status'

interface ResolvePremiumStatusVisibilityInput {
    snapshot: OrganizationBillingSnapshot | null
    consumedTopupCreditsTotal: number
    hasTrialCreditCarryover: boolean
}

export interface PremiumStatusVisibility {
    showTotalCreditsCard: boolean
    showTopupCreditsCard: boolean
    topupTotalCredits: number
    topupCreditsProgress: number
}

function clampNonNegative(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

export function resolvePremiumStatusVisibility({
    snapshot,
    consumedTopupCreditsTotal,
    hasTrialCreditCarryover
}: ResolvePremiumStatusVisibilityInput): PremiumStatusVisibility {
    if (!snapshot || snapshot.membershipState !== 'premium_active') {
        return {
            showTotalCreditsCard: false,
            showTopupCreditsCard: false,
            topupTotalCredits: 0,
            topupCreditsProgress: 0
        }
    }

    const currentTopupBalance = clampNonNegative(snapshot.topupBalance)
    if (currentTopupBalance <= 0) {
        return {
            showTotalCreditsCard: false,
            showTopupCreditsCard: false,
            topupTotalCredits: 0,
            topupCreditsProgress: 0
        }
    }

    const topupTotalCredits = resolveTopupCreditsTotal({
        currentBalance: currentTopupBalance,
        consumedCredits: consumedTopupCreditsTotal,
        trialCreditLimit: snapshot.trial.credits.limit,
        hasTrialCreditCarryover
    })
    const topupCreditsProgress = topupTotalCredits > 0
        ? Math.min(100, Math.max(0, (currentTopupBalance / topupTotalCredits) * 100))
        : 0

    return {
        showTotalCreditsCard: true,
        showTopupCreditsCard: true,
        topupTotalCredits,
        topupCreditsProgress
    }
}
