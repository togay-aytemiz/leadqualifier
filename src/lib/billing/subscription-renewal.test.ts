import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
    cancelSubscriptionRenewal,
    getSubscriptionRenewalState,
    resumeSubscriptionRenewal
} from '@/lib/billing/subscription-renewal'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

interface SupabaseMockOptions {
    userId?: string | null
    rpcResultByFn?: Record<string, { data: unknown; error: unknown }>
    renewalRow?: Record<string, unknown> | null
    renewalRowError?: unknown
}

function createSupabaseMock(options: SupabaseMockOptions = {}) {
    const authGetUserMock = vi.fn(async () => ({
        data: {
            user: options.userId === null
                ? null
                : { id: options.userId ?? 'user_1' }
        }
    }))

    const rpcMock = vi.fn(async (fn: string) => {
        return options.rpcResultByFn?.[fn] ?? { data: { ok: true, status: 'success' }, error: null }
    })

    const maybeSingleMock = vi.fn(async () => ({
        data: options.renewalRow ?? null,
        error: options.renewalRowError ?? null
    }))
    const limitMock = vi.fn(() => ({
        maybeSingle: maybeSingleMock
    }))
    const orderMock = vi.fn(() => ({
        limit: limitMock
    }))
    const inMock = vi.fn(() => ({
        order: orderMock
    }))
    const eqMock = vi.fn(() => ({
        in: inMock
    }))
    const selectMock = vi.fn(() => ({
        eq: eqMock
    }))
    const fromMock = vi.fn((table: string) => {
        if (table === 'organization_subscription_records') {
            return {
                select: selectMock
            }
        }

        throw new Error(`Unexpected table: ${table}`)
    })

    return {
        supabase: {
            auth: {
                getUser: authGetUserMock
            },
            rpc: rpcMock,
            from: fromMock
        },
        rpcMock,
        fromMock
    }
}

describe('subscription renewal controls', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns auto-renew enabled defaults when no subscription row exists', async () => {
        const { supabase } = createSupabaseMock({ renewalRow: null })

        const result = await getSubscriptionRenewalState({
            organizationId: 'org_1',
            supabase: supabase as never
        })

        expect(result).toEqual({
            autoRenew: true,
            cancelAtPeriodEnd: false,
            cancellationRequestedAt: null,
            periodEnd: null,
            pendingPlanChange: null
        })
    })

    it('reads cancel-at-period-end metadata from latest subscription row', async () => {
        const { supabase } = createSupabaseMock({
            renewalRow: {
                metadata: {
                    auto_renew: false,
                    cancel_at_period_end: true,
                    cancellation_requested_at: '2026-02-16T12:00:00.000Z',
                    pending_plan_change: {
                        change_type: 'downgrade',
                        requested_monthly_credits: 1000,
                        requested_monthly_price_try: 349,
                        effective_at: '2026-03-01T00:00:00.000Z',
                        requested_at: '2026-02-16T12:10:00.000Z'
                    }
                },
                period_end: '2026-03-01T00:00:00.000Z'
            }
        })

        const result = await getSubscriptionRenewalState({
            organizationId: 'org_1',
            supabase: supabase as never
        })

        expect(result).toEqual({
            autoRenew: false,
            cancelAtPeriodEnd: true,
            cancellationRequestedAt: '2026-02-16T12:00:00.000Z',
            periodEnd: '2026-03-01T00:00:00.000Z',
            pendingPlanChange: {
                changeType: 'downgrade',
                requestedMonthlyCredits: 1000,
                requestedMonthlyPriceTry: 349,
                effectiveAt: '2026-03-01T00:00:00.000Z',
                requestedAt: '2026-02-16T12:10:00.000Z'
            }
        })
    })

    it('returns unauthorized when cancel action has no user session', async () => {
        const { supabase } = createSupabaseMock({ userId: null })
        createClientMock.mockResolvedValue(supabase)

        const result = await cancelSubscriptionRenewal({
            organizationId: 'org_1'
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'unauthorized'
        })
    })

    it('maps blocked admin-locked response for cancel action', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_subscription_cancel_renewal: {
                    data: {
                        ok: false,
                        status: 'blocked',
                        reason: 'admin_locked'
                    },
                    error: null
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await cancelSubscriptionRenewal({
            organizationId: 'org_1',
            reason: 'test_reason'
        })

        expect(result).toEqual({
            ok: false,
            status: 'blocked',
            error: 'admin_locked'
        })
    })

    it('returns success for resume action', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_subscription_resume_renewal: {
                    data: {
                        ok: true,
                        status: 'success'
                    },
                    error: null
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await resumeSubscriptionRenewal({
            organizationId: 'org_1'
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null
        })
    })

    it('maps missing rpc functions to not_available', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_subscription_resume_renewal: {
                    data: null,
                    error: {
                        code: 'PGRST202'
                    }
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await resumeSubscriptionRenewal({
            organizationId: 'org_1'
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'not_available'
        })
    })
})
