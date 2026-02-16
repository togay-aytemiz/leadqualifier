import { describe, expect, it } from 'vitest'
import { buildOrganizationBillingSnapshot } from '@/lib/billing/snapshot'
import type { OrganizationBillingAccount } from '@/types/database'
import {
    isBillingOnlyPath,
    resolveWorkspaceAccessState
} from '@/lib/billing/workspace-access'

function createBillingAccount(overrides?: Partial<OrganizationBillingAccount>): OrganizationBillingAccount {
    return {
        organization_id: 'org_1',
        membership_state: 'trial_active',
        lock_reason: 'none',
        trial_started_at: '2026-02-01T00:00:00.000Z',
        trial_ends_at: '2026-02-28T00:00:00.000Z',
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

describe('resolveWorkspaceAccessState', () => {
    it('keeps workspace open when billing snapshot is missing', () => {
        expect(resolveWorkspaceAccessState(null)).toEqual({
            isLocked: false,
            mode: 'full'
        })
    })

    it('returns billing-only mode when usage is locked', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount({
                membership_state: 'trial_exhausted',
                lock_reason: 'subscription_required',
                trial_credit_used: 120
            }),
            { nowIso: '2026-02-16T12:00:00.000Z' }
        )

        expect(resolveWorkspaceAccessState(snapshot)).toEqual({
            isLocked: true,
            mode: 'billing_only'
        })
    })

    it('keeps full mode when usage is allowed', () => {
        const snapshot = buildOrganizationBillingSnapshot(
            createBillingAccount(),
            { nowIso: '2026-02-16T12:00:00.000Z' }
        )

        expect(resolveWorkspaceAccessState(snapshot)).toEqual({
            isLocked: false,
            mode: 'full'
        })
    })
})

describe('isBillingOnlyPath', () => {
    it('allows plans and billing paths', () => {
        expect(isBillingOnlyPath('/settings/plans')).toBe(true)
        expect(isBillingOnlyPath('/settings/plans/history')).toBe(true)
        expect(isBillingOnlyPath('/settings/billing')).toBe(true)
    })

    it('blocks workspace paths outside billing pages', () => {
        expect(isBillingOnlyPath('/inbox')).toBe(false)
        expect(isBillingOnlyPath('/skills')).toBe(false)
        expect(isBillingOnlyPath('/settings/organization')).toBe(false)
    })
})

