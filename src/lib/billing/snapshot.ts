import type {
    BillingCreditPoolType,
    BillingLockReason,
    BillingMembershipState,
    OrganizationBillingAccount
} from '@/types/database'
import { calculateCreditProgress, isTopupAllowed, isUsageAllowed } from '@/lib/billing/policy'

export interface CreditBalanceSnapshot {
    limit: number
    used: number
    remaining: number
    progress: number
}

export interface TrialProgressSnapshot {
    startedAt: string
    endsAt: string
    timeProgress: number
    remainingDays: number
    totalDays: number
    credits: CreditBalanceSnapshot
}

export interface PackageProgressSnapshot {
    periodStart: string | null
    periodEnd: string | null
    credits: CreditBalanceSnapshot
}

export interface OrganizationBillingSnapshot {
    organizationId: string
    membershipState: BillingMembershipState
    lockReason: BillingLockReason
    isUsageAllowed: boolean
    isTopupAllowed: boolean
    activeCreditPool: BillingCreditPoolType | null
    trial: TrialProgressSnapshot
    package: PackageProgressSnapshot
    topupBalance: number
    totalRemainingCredits: number
}

interface BuildSnapshotOptions {
    nowIso?: string
}

function toNonNegativeNumber(value: unknown): number {
    const parsed = typeof value === 'string' ? Number.parseFloat(value) : Number(value)
    if (!Number.isFinite(parsed)) return 0
    return Math.max(0, parsed)
}

function parseDate(dateIso: string | null | undefined): Date | null {
    if (!dateIso) return null
    const date = new Date(dateIso)
    if (!Number.isFinite(date.getTime())) return null
    return date
}

function clampPercentage(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, Math.min(100, value))
}

function resolveCreditPool(options: {
    membershipState: BillingMembershipState
    remainingTrialCredits: number
    remainingPackageCredits: number
    topupBalance: number
}): BillingCreditPoolType | null {
    if (options.membershipState === 'trial_active' && options.remainingTrialCredits > 0) {
        return 'trial_pool'
    }

    if (options.membershipState !== 'premium_active') {
        return null
    }

    if (options.remainingPackageCredits > 0) return 'package_pool'
    if (options.topupBalance > 0) return 'topup_pool'
    return null
}

function resolveLockReason(options: {
    membershipState: BillingMembershipState
    lockReason: BillingLockReason
    remainingTrialCredits: number
    trialEndsAt: string
    remainingPackageCredits: number
    topupBalance: number
    nowIso: string
}) {
    if (options.membershipState === 'trial_active') {
        const now = parseDate(options.nowIso)
        const trialEndsAt = parseDate(options.trialEndsAt)
        if (now && trialEndsAt && now > trialEndsAt) return 'trial_time_expired' as const
        if (options.remainingTrialCredits <= 0) return 'trial_credits_exhausted' as const
        return 'none' as const
    }

    if (options.membershipState === 'trial_exhausted') {
        if (options.lockReason === 'trial_time_expired' || options.lockReason === 'trial_credits_exhausted') {
            return options.lockReason
        }
        return 'subscription_required' as const
    }

    if (options.membershipState === 'premium_active') {
        if (options.remainingPackageCredits <= 0 && options.topupBalance <= 0) {
            return 'package_credits_exhausted' as const
        }
        if (options.lockReason === 'past_due') return 'past_due' as const
        return 'none' as const
    }

    if (options.membershipState === 'past_due') return 'past_due' as const
    if (options.membershipState === 'admin_locked') return 'admin_locked' as const
    if (options.membershipState === 'canceled') return 'subscription_required' as const

    return options.lockReason
}

function buildCreditBalance(limitRaw: unknown, usedRaw: unknown): CreditBalanceSnapshot {
    const limit = toNonNegativeNumber(limitRaw)
    const used = toNonNegativeNumber(usedRaw)
    const remaining = Math.max(0, limit - used)

    return {
        limit,
        used,
        remaining,
        progress: calculateCreditProgress({
            limit,
            used
        })
    }
}

export function buildOrganizationBillingSnapshot(
    accountRow: OrganizationBillingAccount,
    options?: BuildSnapshotOptions
): OrganizationBillingSnapshot {
    const nowIso = options?.nowIso ?? new Date().toISOString()
    const nowDate = parseDate(nowIso) ?? new Date()

    const trialCreditBalance = buildCreditBalance(accountRow.trial_credit_limit, accountRow.trial_credit_used)
    const packageCreditBalance = buildCreditBalance(
        accountRow.monthly_package_credit_limit,
        accountRow.monthly_package_credit_used
    )
    const topupBalance = toNonNegativeNumber(accountRow.topup_credit_balance)

    const trialStartedAt = parseDate(accountRow.trial_started_at)
    const trialEndsAt = parseDate(accountRow.trial_ends_at)
    const trialDurationMs = trialStartedAt && trialEndsAt
        ? Math.max(0, trialEndsAt.getTime() - trialStartedAt.getTime())
        : 0
    const trialElapsedMs = trialStartedAt
        ? Math.max(0, nowDate.getTime() - trialStartedAt.getTime())
        : 0

    const timeProgress = trialDurationMs > 0
        ? clampPercentage((trialElapsedMs / trialDurationMs) * 100)
        : 0

    const remainingDays = trialEndsAt
        ? Math.max(0, Math.ceil((trialEndsAt.getTime() - nowDate.getTime()) / (1000 * 60 * 60 * 24)))
        : 0
    const totalDays = trialDurationMs > 0
        ? Math.max(1, Math.ceil(trialDurationMs / (1000 * 60 * 60 * 24)))
        : 0

    const resolvedLockReason = resolveLockReason({
        membershipState: accountRow.membership_state,
        lockReason: accountRow.lock_reason,
        remainingTrialCredits: trialCreditBalance.remaining,
        trialEndsAt: accountRow.trial_ends_at,
        remainingPackageCredits: packageCreditBalance.remaining,
        topupBalance,
        nowIso: nowDate.toISOString()
    })

    const usageAllowed = isUsageAllowed({
        membershipState: accountRow.membership_state,
        remainingTrialCredits: trialCreditBalance.remaining,
        trialEndsAtIso: accountRow.trial_ends_at,
        nowIso: nowDate.toISOString(),
        remainingPackageCredits: packageCreditBalance.remaining,
        topupCredits: topupBalance
    })

    const topupAllowed = isTopupAllowed({
        membershipState: accountRow.membership_state,
        remainingPackageCredits: packageCreditBalance.remaining
    })

    const activeCreditPool = resolveCreditPool({
        membershipState: accountRow.membership_state,
        remainingTrialCredits: trialCreditBalance.remaining,
        remainingPackageCredits: packageCreditBalance.remaining,
        topupBalance
    })

    return {
        organizationId: accountRow.organization_id,
        membershipState: accountRow.membership_state,
        lockReason: resolvedLockReason,
        isUsageAllowed: usageAllowed,
        isTopupAllowed: topupAllowed,
        activeCreditPool,
        trial: {
            startedAt: accountRow.trial_started_at,
            endsAt: accountRow.trial_ends_at,
            timeProgress,
            remainingDays,
            totalDays,
            credits: trialCreditBalance
        },
        package: {
            periodStart: accountRow.current_period_start,
            periodEnd: accountRow.current_period_end,
            credits: packageCreditBalance
        },
        topupBalance,
        totalRemainingCredits: trialCreditBalance.remaining + packageCreditBalance.remaining + topupBalance
    }
}
