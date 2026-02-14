import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateMockSubscriptionCheckout, simulateMockTopupCheckout } from '@/lib/billing/mock-checkout'

const { createClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

interface SupabaseMockOptions {
    userId?: string | null
    rpcResultByFn?: Record<string, { data: unknown; error: unknown }>
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

    return {
        supabase: {
            auth: {
                getUser: authGetUserMock
            },
            rpc: rpcMock
        },
        rpcMock
    }
}

describe('mock checkout simulation wrappers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('returns invalid_input for malformed subscription payload', async () => {
        const result = await simulateMockSubscriptionCheckout({
            organizationId: '',
            simulatedOutcome: 'success',
            monthlyPriceTry: -1,
            monthlyCredits: 0
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'invalid_input'
        })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('returns unauthorized when subscription simulation has no user session', async () => {
        const { supabase } = createSupabaseMock({ userId: null })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 49,
            monthlyCredits: 1000
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'unauthorized'
        })
    })

    it('passes through failed payment status for subscription simulation', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_checkout_subscribe: {
                    data: {
                        ok: false,
                        status: 'failed'
                    },
                    error: null
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'failed',
            monthlyPriceTry: 49,
            monthlyCredits: 1000
        })

        expect(result).toEqual({
            ok: false,
            status: 'failed',
            error: null
        })
    })

    it('returns blocked status when top-up is not allowed', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_checkout_topup: {
                    data: {
                        ok: false,
                        status: 'blocked',
                        reason: 'topup_not_allowed'
                    },
                    error: null
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockTopupCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            credits: 500,
            amountTry: 200
        })

        expect(result).toEqual({
            ok: false,
            status: 'blocked',
            error: 'topup_not_allowed'
        })
    })

    it('returns success status for top-up simulation when provider result succeeds', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_checkout_topup: {
                    data: {
                        ok: true,
                        status: 'success'
                    },
                    error: null
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockTopupCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            credits: 500,
            amountTry: 200
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null
        })
    })
})
