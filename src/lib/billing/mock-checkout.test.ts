import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateMockSubscriptionCheckout, simulateMockTopupCheckout } from '@/lib/billing/mock-checkout'

const { createClientMock, createServiceClientMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceClientMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

interface SupabaseMockOptions {
    userId?: string | null
    rpcResultByFn?: Record<string, { data: unknown; error: unknown }>
    billingAccountRow?: Record<string, unknown> | null
    billingAccountError?: unknown
    assertMemberError?: unknown
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
        if (fn === 'assert_org_member_or_admin') {
            return {
                data: null,
                error: options.assertMemberError ?? null
            }
        }
        return options.rpcResultByFn?.[fn] ?? { data: { ok: true, status: 'success' }, error: null }
    })

    const billingMaybeSingleMock = vi.fn(async () => ({
        data: options.billingAccountRow ?? null,
        error: options.billingAccountError ?? null
    }))
    const billingEqMock = vi.fn(() => ({
        maybeSingle: billingMaybeSingleMock
    }))
    const billingSelectMock = vi.fn(() => ({
        eq: billingEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'organization_billing_accounts') {
            return {
                select: billingSelectMock
            }
        }

        throw new Error(`Unexpected tenant table: ${table}`)
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
        fromMock,
        billingSelectMock,
        billingEqMock,
        billingMaybeSingleMock
    }
}

function createServiceSupabaseMock() {
    const purchaseInsertMaybeSingleMock = vi.fn(async () => ({
        data: { id: 'order_1' },
        error: null
    }))
    const purchaseInsertSelectMock = vi.fn(() => ({
        maybeSingle: purchaseInsertMaybeSingleMock
    }))
    const purchaseInsertMock = vi.fn(() => ({
        select: purchaseInsertSelectMock
    }))

    const purchaseUpdateEqMock = vi.fn(async () => ({ error: null }))
    const purchaseUpdateMock = vi.fn(() => ({
        eq: purchaseUpdateEqMock
    }))

    const billingUpdateEqMock = vi.fn(async () => ({ error: null }))
    const billingUpdateMock = vi.fn(() => ({
        eq: billingUpdateEqMock
    }))

    const ledgerInsertMock = vi.fn(async () => ({ error: null }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'credit_purchase_orders') {
            return {
                insert: purchaseInsertMock,
                update: purchaseUpdateMock
            }
        }

        if (table === 'organization_billing_accounts') {
            return {
                update: billingUpdateMock
            }
        }

        if (table === 'organization_credit_ledger') {
            return {
                insert: ledgerInsertMock
            }
        }

        throw new Error(`Unexpected service table: ${table}`)
    })

    return {
        client: {
            from: fromMock
        },
        spies: {
            fromMock,
            purchaseInsertMock,
            purchaseInsertSelectMock,
            purchaseInsertMaybeSingleMock,
            purchaseUpdateMock,
            purchaseUpdateEqMock,
            billingUpdateMock,
            billingUpdateEqMock,
            ledgerInsertMock
        }
    }
}

describe('mock checkout simulation wrappers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
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
            error: 'invalid_input',
            changeType: null,
            effectiveAt: null
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
            error: 'unauthorized',
            changeType: null,
            effectiveAt: null
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
            error: null,
            changeType: null,
            effectiveAt: null
        })
    })

    it('passes through scheduled downgrade status for subscription simulation', async () => {
        const { supabase } = createSupabaseMock({
            rpcResultByFn: {
                mock_checkout_subscribe: {
                    data: {
                        ok: true,
                        status: 'scheduled',
                        change_type: 'downgrade',
                        effective_at: '2026-03-01T00:00:00.000Z'
                    },
                    error: null
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 49,
            monthlyCredits: 1000
        })

        expect(result).toEqual({
            ok: true,
            status: 'scheduled',
            error: null,
            changeType: 'downgrade',
            effectiveAt: '2026-03-01T00:00:00.000Z'
        })
    })

    it('falls back to compatibility mode when legacy RPC blocks top-up for premium accounts', async () => {
        const serviceSupabase = createServiceSupabaseMock()
        createServiceClientMock.mockReturnValue(serviceSupabase.client)

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
            },
            billingAccountRow: {
                membership_state: 'premium_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 500,
                monthly_package_credit_used: 0,
                topup_credit_balance: 0
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
            error: null,
            changeType: null,
            effectiveAt: null
        })
        expect(createServiceClientMock).toHaveBeenCalledTimes(1)
        expect(serviceSupabase.spies.ledgerInsertMock).toHaveBeenCalledTimes(1)
    })

    it('returns blocked when top-up is not allowed and account is not premium', async () => {
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
            },
            billingAccountRow: {
                membership_state: 'trial_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 0,
                monthly_package_credit_used: 0,
                topup_credit_balance: 0
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
            error: 'topup_not_allowed',
            changeType: null,
            effectiveAt: null
        })
        expect(createServiceClientMock).not.toHaveBeenCalled()
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
            error: null,
            changeType: null,
            effectiveAt: null
        })
    })
})
