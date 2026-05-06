import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OrganizationBillingAccount } from '@/types/database'
import { BillingUsageLockedError, assertOrganizationUsageAllowed, resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

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

function createSupabaseMock(result: { data: unknown; error: unknown }) {
    const rpcMock = vi.fn(async () => ({
        data: { status: 'not_due', renewed_periods: 0 },
        error: null
    }))
    const maybeSingleMock = vi.fn(async () => result)
    const eqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    const fromMock = vi.fn(() => ({ select: selectMock }))

    return {
        from: fromMock,
        rpc: rpcMock
    }
}

describe('billing entitlements', () => {
    beforeEach(() => {
        createClientMock.mockReset()
        vi.unstubAllEnvs()
    })

    it('falls back to allowed entitlement when billing row does not exist', async () => {
        const supabase = createSupabaseMock({ data: null, error: null })
        createClientMock.mockResolvedValue(supabase)

        const entitlement = await resolveOrganizationUsageEntitlement('org_1')

        expect(entitlement.isUsageAllowed).toBe(true)
        expect(entitlement.lockReason).toBeNull()
        expect(entitlement.membershipState).toBeNull()
    })

    it('fails closed in production when billing row is unexpectedly missing', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        const supabase = createSupabaseMock({ data: null, error: null })
        createClientMock.mockResolvedValue(supabase)

        const entitlement = await resolveOrganizationUsageEntitlement('org_1')

        expect(entitlement.isUsageAllowed).toBe(false)
        expect(entitlement.lockReason).toBe('admin_locked')
        expect(entitlement.membershipState).toBe('admin_locked')
    })

    it('fails closed in production when billing lookup errors', async () => {
        vi.stubEnv('NODE_ENV', 'production')
        const supabase = createSupabaseMock({
            data: null,
            error: { code: 'PGRST500', message: 'database unavailable' }
        })
        createClientMock.mockResolvedValue(supabase)

        const entitlement = await resolveOrganizationUsageEntitlement('org_1')

        expect(entitlement.isUsageAllowed).toBe(false)
        expect(entitlement.lockReason).toBe('admin_locked')
        expect(entitlement.membershipState).toBe('admin_locked')
    })

    it('returns locked entitlement when trial is exhausted', async () => {
        const supabase = createSupabaseMock({
            data: createBillingAccount({
                membership_state: 'trial_exhausted',
                lock_reason: 'subscription_required',
                trial_credit_used: 120
            }),
            error: null
        })
        createClientMock.mockResolvedValue(supabase)

        const entitlement = await resolveOrganizationUsageEntitlement('org_1')

        expect(entitlement.isUsageAllowed).toBe(false)
        expect(entitlement.lockReason).toBe('subscription_required')
        expect(entitlement.membershipState).toBe('trial_exhausted')
    })

    it('renews due manual-admin subscriptions before resolving usage entitlement', async () => {
        const calls: string[] = []
        const supabase = createSupabaseMock({
            data: createBillingAccount({
                membership_state: 'premium_active',
                trial_credit_used: 120,
                current_period_start: '2026-05-01T10:00:00.000Z',
                current_period_end: '2026-06-01T10:00:00.000Z',
                monthly_package_credit_limit: 1000,
                monthly_package_credit_used: 0
            }),
            error: null
        })
        supabase.rpc.mockImplementation(async () => {
            calls.push('rpc')
            return {
                data: { status: 'renewed', renewed_periods: 1 },
                error: null
            }
        })
        const originalFrom = supabase.from
        supabase.from = vi.fn((table: string) => {
            calls.push('select')
            return originalFrom(table)
        })
        createClientMock.mockResolvedValue(supabase)

        const entitlement = await resolveOrganizationUsageEntitlement('org_1')

        expect(entitlement.isUsageAllowed).toBe(true)
        expect(supabase.rpc).toHaveBeenCalledWith('renew_due_manual_admin_subscription', {
            target_organization_id: 'org_1'
        })
        expect(calls).toEqual(['rpc', 'select'])
    })

    it('throws BillingUsageLockedError when usage is not allowed', async () => {
        const supabase = createSupabaseMock({
            data: createBillingAccount({
                membership_state: 'past_due',
                lock_reason: 'past_due',
                monthly_package_credit_limit: 100,
                monthly_package_credit_used: 10
            }),
            error: null
        })
        createClientMock.mockResolvedValue(supabase)

        await expect(assertOrganizationUsageAllowed('org_1')).rejects.toBeInstanceOf(BillingUsageLockedError)
    })
})
