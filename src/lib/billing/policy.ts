export type BillingMembershipState =
    | 'trial_active'
    | 'trial_exhausted'
    | 'premium_active'
    | 'past_due'
    | 'canceled'
    | 'admin_locked'

export interface TopupEligibilityInput {
    membershipState: BillingMembershipState
    remainingPackageCredits: number
    currentPeriodEndIso?: string | null
    nowIso?: string
}

export const PREMIUM_PERIOD_END_GRACE_WINDOW_MS = 1000 * 60 * 60

export interface UsageEligibilityInput {
    membershipState: BillingMembershipState
    remainingTrialCredits: number
    trialEndsAtIso: string | null
    currentPeriodEndIso?: string | null
    nowIso?: string
    remainingPackageCredits: number
    topupCredits: number
}

interface CreditProgressInput {
    limit: number
    used: number
}

function clampNonNegative(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

function parseDate(value: string | null | undefined) {
    if (!value) return null
    const date = new Date(value)
    if (!Number.isFinite(date.getTime())) return null
    return date
}

export function hasPremiumPeriodEnded(input: {
    membershipState: BillingMembershipState
    currentPeriodEndIso?: string | null
    nowIso?: string
}) {
    if (input.membershipState !== 'premium_active') return false

    const periodEnd = parseDate(input.currentPeriodEndIso)
    if (!periodEnd) return false

    const now = parseDate(input.nowIso) ?? new Date()
    if (!Number.isFinite(now.getTime())) return false

    return now.getTime() > periodEnd.getTime() + PREMIUM_PERIOD_END_GRACE_WINDOW_MS
}

export function isTopupAllowed(input: TopupEligibilityInput) {
    if (hasPremiumPeriodEnded(input)) return false
    return input.membershipState === 'premium_active'
}

export function isUsageAllowed(input: UsageEligibilityInput) {
    const remainingTrialCredits = clampNonNegative(input.remainingTrialCredits)
    const remainingPackageCredits = clampNonNegative(input.remainingPackageCredits)
    const topupCredits = clampNonNegative(input.topupCredits)

    if (
        input.membershipState === 'admin_locked'
        || input.membershipState === 'past_due'
        || input.membershipState === 'canceled'
    ) {
        return false
    }

    if (input.membershipState === 'trial_active') {
        if (remainingTrialCredits <= 0) return false
        if (!input.trialEndsAtIso) return false
        const now = input.nowIso ? new Date(input.nowIso) : new Date()
        const trialEndsAt = new Date(input.trialEndsAtIso)
        if (!Number.isFinite(now.getTime()) || !Number.isFinite(trialEndsAt.getTime())) return false
        return now <= trialEndsAt
    }

    if (input.membershipState === 'trial_exhausted') {
        return false
    }

    if (input.membershipState === 'premium_active') {
        if (hasPremiumPeriodEnded(input)) return false
        return remainingPackageCredits > 0 || topupCredits > 0
    }

    return false
}

export function calculateCreditProgress(input: CreditProgressInput) {
    const limit = clampNonNegative(input.limit)
    const used = clampNonNegative(input.used)
    if (limit <= 0) return 0

    const percentage = (used / limit) * 100
    return Math.min(100, Math.max(0, percentage))
}
