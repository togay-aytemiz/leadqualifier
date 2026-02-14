import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    adminAdjustTopupCredits,
    adminAdjustPackageCredits,
    adminAdjustTrialCredits,
    adminAssignPremium,
    adminCancelPremium,
    adminExtendTrial,
    adminSetMembershipOverride
} from '@/lib/admin/billing-manual'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

interface RpcResult {
    error: unknown
}

interface SupabaseMockOptions {
    userId?: string | null
    isSystemAdmin?: boolean
    profileError?: unknown
    rpcResults?: Record<string, RpcResult>
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
    const authGetUserMock = vi.fn(async () => ({
        data: {
            user: options.userId === null
                ? null
                : { id: options.userId ?? 'admin-user-1' }
        }
    }))

    const profileMaybeSingleMock = vi.fn(async () => ({
        data: { is_system_admin: options.isSystemAdmin ?? true },
        error: options.profileError ?? null
    }))
    const profileEqMock = vi.fn(() => ({ maybeSingle: profileMaybeSingleMock }))
    const profileSelectMock = vi.fn(() => ({ eq: profileEqMock }))

    const rpcMock = vi.fn(async (functionName: string) => (
        options.rpcResults?.[functionName] ?? { error: null }
    ))

    const fromMock = vi.fn((table: string) => {
        if (table === 'profiles') {
            return {
                select: profileSelectMock
            }
        }

        throw new Error(`Unexpected table requested in test mock: ${table}`)
    })

    return {
        supabase: {
            auth: {
                getUser: authGetUserMock
            },
            from: fromMock,
            rpc: rpcMock
        },
        rpcMock
    }
}

describe('admin billing manual actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns invalid_input when extend trial payload is incomplete', async () => {
        const result = await adminExtendTrial({
            organizationId: 'org-1',
            trialEndsAtIso: '',
            reason: ''
        })

        expect(result).toEqual({
            ok: false,
            error: 'invalid_input'
        })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('returns unauthorized when user is not authenticated', async () => {
        const { supabase } = createSupabaseMock({
            userId: null
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await adminCancelPremium({
            organizationId: 'org-1',
            reason: 'manual cleanup'
        })

        expect(result).toEqual({
            ok: false,
            error: 'unauthorized'
        })
    })

    it('returns forbidden when user is not a system admin', async () => {
        const { supabase } = createSupabaseMock({
            isSystemAdmin: false
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await adminAdjustTopupCredits({
            organizationId: 'org-1',
            creditDelta: 25,
            reason: 'manual topup'
        })

        expect(result).toEqual({
            ok: false,
            error: 'forbidden'
        })
    })

    it('maps missing-RPC errors to not_available', async () => {
        const { supabase } = createSupabaseMock({
            rpcResults: {
                admin_adjust_topup_credits: {
                    error: { code: 'PGRST202' }
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await adminAdjustTopupCredits({
            organizationId: 'org-1',
            creditDelta: 25,
            reason: 'manual topup'
        })

        expect(result).toEqual({
            ok: false,
            error: 'not_available'
        })
    })

    it('calls RPC with expected payload for premium assignment', async () => {
        const { supabase, rpcMock } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const result = await adminAssignPremium({
            organizationId: 'org-1',
            periodStartIso: '2026-02-01T00:00:00.000Z',
            periodEndIso: '2026-03-01T00:00:00.000Z',
            monthlyPriceTry: 49,
            monthlyCredits: 1200,
            reason: 'activate premium manually'
        })

        expect(result).toEqual({
            ok: true,
            error: null
        })
        expect(rpcMock).toHaveBeenCalledWith('admin_assign_premium', {
            target_organization_id: 'org-1',
            period_start: '2026-02-01T00:00:00.000Z',
            period_end: '2026-03-01T00:00:00.000Z',
            monthly_price_try: 49,
            monthly_credits: 1200,
            action_reason: 'activate premium manually'
        })
    })

    it('calls membership override RPC with explicit state and lock reason', async () => {
        const { supabase, rpcMock } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const result = await adminSetMembershipOverride({
            organizationId: 'org-1',
            membershipState: 'admin_locked',
            lockReason: 'admin_locked',
            reason: 'fraud investigation hold'
        })

        expect(result).toEqual({
            ok: true,
            error: null
        })
        expect(rpcMock).toHaveBeenCalledWith('admin_set_membership_override', {
            target_organization_id: 'org-1',
            new_membership_state: 'admin_locked',
            new_lock_reason: 'admin_locked',
            action_reason: 'fraud investigation hold'
        })
    })

    it('calls trial/package credit adjustment RPCs with delta values', async () => {
        const { supabase, rpcMock } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const trialResult = await adminAdjustTrialCredits({
            organizationId: 'org-1',
            creditDelta: 40,
            reason: 'support extension'
        })
        const packageResult = await adminAdjustPackageCredits({
            organizationId: 'org-1',
            creditDelta: -100,
            reason: 'package correction'
        })

        expect(trialResult).toEqual({
            ok: true,
            error: null
        })
        expect(packageResult).toEqual({
            ok: true,
            error: null
        })

        expect(rpcMock).toHaveBeenCalledWith('admin_adjust_trial_credits', {
            target_organization_id: 'org-1',
            credit_delta: 40,
            action_reason: 'support extension'
        })
        expect(rpcMock).toHaveBeenCalledWith('admin_adjust_package_credits', {
            target_organization_id: 'org-1',
            credit_delta: -100,
            action_reason: 'package correction'
        })
    })
})
