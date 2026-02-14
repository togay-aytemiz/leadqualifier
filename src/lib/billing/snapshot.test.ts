import { describe, expect, it } from 'vitest'
import type { OrganizationBillingAccount } from '@/types/database'
import { buildOrganizationBillingSnapshot } from '@/lib/billing/snapshot'

function createBillingAccount(overrides?: Partial<OrganizationBillingAccount>): OrganizationBillingAccount {
    return {
        organization_id: 'org_1',
        membership_state: 'trial_active',
        lock_reason: 'none',
        trial_started_at: '2026-02-01T00:00:00.000Z',
        trial_ends_at: '2026-02-15T00:00:00.000Z',
        trial_credit_limit: 120,
        trial_credit_used: 20,
        current_period_start: null,
        current_period_end: null,
        monthly_package_credit_limit: 0,
        monthly_package_credit_used: 0,
        topup_credit_balance: 0,
        premium_assigned_at: null,
        last_manual_action_at: null,
        created_at: '2026-02-01T00:00:00.000Z',
        updated_at: '2026-02-01T00:00:00.000Z',
        ...overrides
    }
}

describe('buildOrganizationBillingSnapshot', () => {
    it('returns trial snapshot for active trial users', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount(),
            { nowIso: '2026-02-08T00:00:00.000Z' }
        )

        expect(snapshot.membershipState).toBe('trial_active')
        expect(snapshot.isUsageAllowed).toBe(true)
        expect(snapshot.isTopupAllowed).toBe(false)
        expect(snapshot.lockReason).toBe('none')
        expect(snapshot.activeCreditPool).toBe('trial_pool')
        expect(snapshot.trial.credits.remaining).toBe(100)
        expect(snapshot.trial.remainingDays).toBe(7)
    })

    it('marks trial as time-expired when trial end passes', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount(),
            { nowIso: '2026-02-16T00:00:00.000Z' }
        )

        expect(snapshot.isUsageAllowed).toBe(false)
        expect(snapshot.lockReason).toBe('trial_time_expired')
        expect(snapshot.trial.remainingDays).toBe(0)
        expect(snapshot.trial.timeProgress).toBe(100)
    })

    it('forces subscription_required lock for exhausted trial state with missing lock reason', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount({
                membership_state: 'trial_exhausted',
                lock_reason: 'none',
                trial_credit_used: 120
            }),
            { nowIso: '2026-02-10T00:00:00.000Z' }
        )

        expect(snapshot.isUsageAllowed).toBe(false)
        expect(snapshot.lockReason).toBe('subscription_required')
    })

    it('allows usage and top-up for premium users after package exhaustion when top-up exists', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount({
                membership_state: 'premium_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 100,
                monthly_package_credit_used: 100,
                topup_credit_balance: 7.5,
                current_period_start: '2026-02-01T00:00:00.000Z',
                current_period_end: '2026-03-01T00:00:00.000Z'
            }),
            { nowIso: '2026-02-14T00:00:00.000Z' }
        )

        expect(snapshot.isUsageAllowed).toBe(true)
        expect(snapshot.isTopupAllowed).toBe(true)
        expect(snapshot.activeCreditPool).toBe('topup_pool')
        expect(snapshot.package.credits.remaining).toBe(0)
        expect(snapshot.topupBalance).toBe(7.5)
    })

    it('locks premium users when both package and top-up credits are exhausted', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount({
                membership_state: 'premium_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 80,
                monthly_package_credit_used: 80,
                topup_credit_balance: 0
            }),
            { nowIso: '2026-02-14T00:00:00.000Z' }
        )

        expect(snapshot.isUsageAllowed).toBe(false)
        expect(snapshot.lockReason).toBe('package_credits_exhausted')
        expect(snapshot.activeCreditPool).toBeNull()
    })
})
