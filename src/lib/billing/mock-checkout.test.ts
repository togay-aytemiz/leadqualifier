import { beforeEach, describe, expect, it, vi } from 'vitest'
import { simulateMockSubscriptionCheckout, simulateMockTopupCheckout } from '@/lib/billing/mock-checkout'
import { IyzicoClientError } from '@/lib/billing/providers/iyzico/client'

const { createClientMock, createServiceClientMock, initializeIyzicoSubscriptionCheckoutMock, initializeIyzicoTopupCheckoutMock, upgradeIyzicoSubscriptionMock } = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    createServiceClientMock: vi.fn(),
    initializeIyzicoSubscriptionCheckoutMock: vi.fn(),
    initializeIyzicoTopupCheckoutMock: vi.fn(),
    upgradeIyzicoSubscriptionMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

vi.mock('@/lib/billing/providers/iyzico/client', () => {
    class MockIyzicoClientError extends Error {
        readonly code: string
        readonly providerErrorCode: string | null
        readonly providerErrorMessage: string | null
        readonly providerErrorGroup: string | null

        constructor(
            code: string,
            message: string,
            details?: {
                providerErrorCode?: string | null
                providerErrorMessage?: string | null
                providerErrorGroup?: string | null
            }
        ) {
            super(message)
            this.code = code
            this.providerErrorCode = details?.providerErrorCode ?? null
            this.providerErrorMessage = details?.providerErrorMessage ?? null
            this.providerErrorGroup = details?.providerErrorGroup ?? null
        }
    }

    return {
        initializeIyzicoSubscriptionCheckout: initializeIyzicoSubscriptionCheckoutMock,
        initializeIyzicoTopupCheckout: initializeIyzicoTopupCheckoutMock,
        upgradeIyzicoSubscription: upgradeIyzicoSubscriptionMock,
        IyzicoClientError: MockIyzicoClientError
    }
})

interface SupabaseMockOptions {
    userId?: string | null
    rpcResultByFn?: Record<string, { data: unknown; error: unknown }>
    billingAccountRow?: Record<string, unknown> | null
    billingAccountError?: unknown
    assertMemberError?: unknown
    activeSubscriptionRow?: Record<string, unknown> | null
    activeSubscriptionError?: unknown
    profileRow?: Record<string, unknown> | null
    organizationRow?: Record<string, unknown> | null
    billingProfileRow?: Record<string, unknown> | null
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

    const subscriptionMaybeSingleMock = vi.fn(async () => ({
        data: options.activeSubscriptionRow ?? null,
        error: options.activeSubscriptionError ?? null
    }))
    const subscriptionLimitMock = vi.fn(() => ({
        maybeSingle: subscriptionMaybeSingleMock
    }))
    const subscriptionOrderMock = vi.fn(() => ({
        limit: subscriptionLimitMock
    }))
    const subscriptionInMock = vi.fn(() => ({
        order: subscriptionOrderMock
    }))
    const subscriptionSecondEqMock = vi.fn(() => ({
        in: subscriptionInMock
    }))
    const subscriptionFirstEqMock = vi.fn(() => ({
        eq: subscriptionSecondEqMock
    }))
    const subscriptionSelectMock = vi.fn(() => ({
        eq: subscriptionFirstEqMock
    }))

    const profileMaybeSingleMock = vi.fn(async () => ({
        data: options.profileRow ?? {
            full_name: 'Iyzico Test',
            email: 'test@example.com'
        },
        error: null
    }))
    const profileEqMock = vi.fn(() => ({
        maybeSingle: profileMaybeSingleMock
    }))
    const profileSelectMock = vi.fn(() => ({
        eq: profileEqMock
    }))

    const organizationMaybeSingleMock = vi.fn(async () => ({
        data: options.organizationRow ?? {
            name: 'Sandbox Org'
        },
        error: null
    }))
    const organizationEqMock = vi.fn(() => ({
        maybeSingle: organizationMaybeSingleMock
    }))
    const organizationSelectMock = vi.fn(() => ({
        eq: organizationEqMock
    }))

    const billingProfileMaybeSingleMock = vi.fn(async () => ({
        data: options.billingProfileRow ?? null,
        error: null
    }))
    const billingProfileEqMock = vi.fn(() => ({
        maybeSingle: billingProfileMaybeSingleMock
    }))
    const billingProfileSelectMock = vi.fn(() => ({
        eq: billingProfileEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'organization_billing_accounts') {
            return {
                select: billingSelectMock
            }
        }

        if (table === 'organization_subscription_records') {
            return {
                select: subscriptionSelectMock
            }
        }

        if (table === 'profiles') {
            return {
                select: profileSelectMock
            }
        }

        if (table === 'organizations') {
            return {
                select: organizationSelectMock
            }
        }

        if (table === 'organization_billing_profiles') {
            return {
                select: billingProfileSelectMock
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
        billingMaybeSingleMock,
        billingProfileSelectMock,
        billingProfileEqMock,
        billingProfileMaybeSingleMock,
        subscriptionSelectMock,
        subscriptionFirstEqMock,
        subscriptionSecondEqMock,
        subscriptionInMock,
        subscriptionOrderMock,
        subscriptionLimitMock,
        subscriptionMaybeSingleMock
    }
}

function createServiceSupabaseMock() {
    const subscriptionInsertMaybeSingleMock = vi.fn(async () => ({
        data: {
            id: 'sub_row_1',
            metadata: {}
        },
        error: null
    }))
    const subscriptionInsertSelectMock = vi.fn(() => ({
        maybeSingle: subscriptionInsertMaybeSingleMock
    }))
    const subscriptionInsertMock = vi.fn(() => ({
        select: subscriptionInsertSelectMock
    }))

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

    const subscriptionUpdateEqMock = vi.fn(async () => ({ error: null }))
    const subscriptionUpdateMock = vi.fn(() => ({
        eq: subscriptionUpdateEqMock
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

        if (table === 'organization_subscription_records') {
            return {
                insert: subscriptionInsertMock,
                update: subscriptionUpdateMock
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
            subscriptionInsertMock,
            subscriptionInsertSelectMock,
            subscriptionInsertMaybeSingleMock,
            purchaseInsertMock,
            purchaseInsertSelectMock,
            purchaseInsertMaybeSingleMock,
            purchaseUpdateMock,
            purchaseUpdateEqMock,
            billingUpdateMock,
            billingUpdateEqMock,
            subscriptionUpdateMock,
            subscriptionUpdateEqMock,
            ledgerInsertMock
        }
    }
}

describe('mock checkout simulation wrappers', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NODE_ENV = 'test'
        process.env.BILLING_PROVIDER = 'mock'
        process.env.BILLING_MOCK_ENABLED = '1'
        delete process.env.IYZICO_API_KEY
        delete process.env.IYZICO_SECRET_KEY
        delete process.env.IYZICO_BASE_URL
        delete process.env.IYZICO_SUBSCRIPTION_PLAN_STARTER_REF
        delete process.env.IYZICO_SUBSCRIPTION_PLAN_GROWTH_REF
        delete process.env.IYZICO_SUBSCRIPTION_PLAN_SCALE_REF
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    it('returns provider_not_configured for subscription checkout when provider env is missing in production', async () => {
        process.env.NODE_ENV = 'production'
        delete process.env.BILLING_PROVIDER

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 49,
            monthlyCredits: 1000
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'provider_not_configured',
            changeType: null,
            effectiveAt: null
        })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('maps provider insufficient-funds failures for subscription checkout', async () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        process.env.IYZICO_API_KEY = 'api-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
        process.env.IYZICO_BASE_URL = 'https://sandbox-api.iyzipay.com'
        process.env.IYZICO_SUBSCRIPTION_PLAN_STARTER_REF = 'starter-ref'

        const { supabase } = createSupabaseMock({
            billingAccountRow: {
                membership_state: 'trial_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 0,
                monthly_package_credit_used: 0,
                topup_credit_balance: 0
            }
        })
        const { client: serviceClient } = createServiceSupabaseMock()

        createClientMock.mockResolvedValue(supabase)
        createServiceClientMock.mockReturnValue(serviceClient)
        initializeIyzicoSubscriptionCheckoutMock.mockRejectedValue(
            new IyzicoClientError('request_failed', 'Kart limiti yetersiz, yetersiz bakiye', {
                providerErrorCode: '10051',
                providerErrorMessage: 'Kart limiti yetersiz, yetersiz bakiye'
            })
        )

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 349,
            monthlyCredits: 1000,
            planId: 'starter',
            callbackUrl: 'http://127.0.0.1:3001/api/billing/iyzico/callback?action=subscribe&locale=tr',
            locale: 'tr'
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'insufficient_funds',
            changeType: null,
            effectiveAt: null
        })
    })

    it('prefers saved billing profile values when initializing iyzico subscription checkout', async () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        process.env.IYZICO_API_KEY = 'api-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
        process.env.IYZICO_BASE_URL = 'https://sandbox-api.iyzipay.com'
        process.env.IYZICO_SUBSCRIPTION_PLAN_STARTER_REF = 'starter-ref'

        const { supabase } = createSupabaseMock({
            billingAccountRow: {
                membership_state: 'trial_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 0,
                monthly_package_credit_used: 0,
                topup_credit_balance: 0
            },
            profileRow: {
                full_name: 'Ayse Yilmaz',
                email: 'operator@example.com'
            },
            organizationRow: {
                name: 'Qualy Klinik'
            },
            billingProfileRow: {
                company_name: 'Qualy Klinik A.S.',
                billing_email: 'finance@qualy.com',
                billing_phone: '+905551112233',
                tax_identity_number: '11111111111',
                address_line_1: 'Bagdat Cad. 10',
                city: 'Istanbul',
                postal_code: '34740',
                country: 'Turkey'
            }
        })
        const { client: serviceClient } = createServiceSupabaseMock()

        createClientMock.mockResolvedValue(supabase)
        createServiceClientMock.mockReturnValue(serviceClient)
        initializeIyzicoSubscriptionCheckoutMock.mockResolvedValue({
            status: 'success',
            token: 'subscription-token',
            checkoutFormContent: '<div id="iyzico-checkout"></div>'
        })

        await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 349,
            monthlyCredits: 1000,
            planId: 'starter',
            callbackUrl: 'http://127.0.0.1:3001/api/billing/iyzico/callback?action=subscribe&locale=tr',
            locale: 'tr'
        })

        expect(initializeIyzicoSubscriptionCheckoutMock).toHaveBeenCalledWith(expect.objectContaining({
            customer: expect.objectContaining({
                email: 'finance@qualy.com',
                gsmNumber: '+905551112233',
                identityNumber: '11111111111',
                billingAddress: expect.objectContaining({
                    contactName: 'Qualy Klinik A.S.',
                    address: 'Bagdat Cad. 10',
                    city: 'Istanbul',
                    country: 'Turkey',
                    zipCode: '34740'
                }),
                shippingAddress: expect.objectContaining({
                    contactName: 'Qualy Klinik A.S.'
                })
            })
        }))
    })

    it('returns provider_not_configured for top-up checkout when mock is requested without explicit opt-in', async () => {
        process.env.BILLING_PROVIDER = 'mock'
        delete process.env.BILLING_MOCK_ENABLED

        const result = await simulateMockTopupCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            credits: 500,
            amountTry: 200
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'provider_not_configured',
            changeType: null,
            effectiveAt: null
        })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('maps provider invalid-cvc failures for top-up checkout', async () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        process.env.IYZICO_API_KEY = 'api-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
        process.env.IYZICO_BASE_URL = 'https://sandbox-api.iyzipay.com'

        const { supabase } = createSupabaseMock({
            billingAccountRow: {
                membership_state: 'premium_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 1000,
                monthly_package_credit_used: 0,
                topup_credit_balance: 0
            }
        })
        const { client: serviceClient } = createServiceSupabaseMock()

        createClientMock.mockResolvedValue(supabase)
        createServiceClientMock.mockReturnValue(serviceClient)
        initializeIyzicoTopupCheckoutMock.mockRejectedValue(
            new IyzicoClientError('request_failed', 'Cvc2 bilgisi hatalı', {
                providerErrorCode: '10084',
                providerErrorMessage: 'Cvc2 bilgisi hatalı'
            })
        )

        const result = await simulateMockTopupCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            credits: 500,
            amountTry: 200,
            callbackUrl: 'http://127.0.0.1:3001/api/billing/iyzico/callback?action=topup&locale=tr',
            locale: 'tr',
            customerIp: '127.0.0.1'
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'invalid_cvc',
            changeType: null,
            effectiveAt: null
        })
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

    it('schedules active premium iyzico downgrades for next period and persists pending plan metadata', async () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        process.env.IYZICO_API_KEY = 'api-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
        process.env.IYZICO_BASE_URL = 'https://sandbox-api.iyzipay.com'
        process.env.IYZICO_SUBSCRIPTION_PLAN_STARTER_REF = 'starter-plan-ref'

        const serviceSupabase = createServiceSupabaseMock()
        createServiceClientMock.mockReturnValue(serviceSupabase.client)
        upgradeIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {}
        })

        const { supabase } = createSupabaseMock({
            billingAccountRow: {
                membership_state: 'premium_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 2000,
                monthly_package_credit_used: 450,
                topup_credit_balance: 30
            },
            activeSubscriptionRow: {
                id: 'sub_row_1',
                status: 'active',
                provider_subscription_id: 'sub_ref_growth',
                period_start: '2026-03-01T00:00:00.000Z',
                period_end: '2026-04-01T00:00:00.000Z',
                metadata: {
                    source: 'iyzico_checkout_form'
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 349,
            monthlyCredits: 1000,
            planId: 'starter'
        })

        expect(result).toEqual({
            ok: true,
            status: 'scheduled',
            error: null,
            changeType: 'downgrade',
            effectiveAt: '2026-04-01T00:00:00.000Z'
        })
        expect(upgradeIyzicoSubscriptionMock).toHaveBeenCalledWith({
            subscriptionReferenceCode: 'sub_ref_growth',
            newPricingPlanReferenceCode: 'starter-plan-ref',
            upgradePeriod: 'NEXT_PERIOD'
        })
        expect(serviceSupabase.spies.subscriptionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                change_type: 'downgrade',
                requested_plan_id: 'starter',
                requested_monthly_credits: 1000,
                requested_monthly_price_try: 349,
                pending_plan_change: expect.objectContaining({
                    change_type: 'downgrade',
                    requested_monthly_credits: 1000,
                    requested_monthly_price_try: 349,
                    effective_at: '2026-04-01T00:00:00.000Z'
                })
            })
        }))
    })

    it('upgrades active premium subscription through iyzico when a higher plan is selected', async () => {
        process.env.BILLING_PROVIDER = 'iyzico'
        process.env.IYZICO_API_KEY = 'api-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
        process.env.IYZICO_BASE_URL = 'https://sandbox-api.iyzipay.com'
        process.env.IYZICO_SUBSCRIPTION_PLAN_GROWTH_REF = 'growth-plan-ref'

        const serviceSupabase = createServiceSupabaseMock()
        createServiceClientMock.mockReturnValue(serviceSupabase.client)
        upgradeIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {
                referenceCode: 'sub_ref_growth',
                startDate: String(Date.parse('2026-03-01T00:00:00.000Z')),
                endDate: String(Date.parse('2026-04-01T00:00:00.000Z'))
            }
        })

        const { supabase } = createSupabaseMock({
            billingAccountRow: {
                membership_state: 'premium_active',
                lock_reason: 'none',
                monthly_package_credit_limit: 1000,
                monthly_package_credit_used: 150,
                topup_credit_balance: 20
            },
            activeSubscriptionRow: {
                id: 'sub_row_1',
                status: 'active',
                provider_subscription_id: 'sub_ref_starter',
                period_start: '2026-03-01T00:00:00.000Z',
                period_end: '2026-04-01T00:00:00.000Z',
                metadata: {
                    source: 'iyzico_checkout_form'
                }
            }
        })
        createClientMock.mockResolvedValue(supabase)

        const result = await simulateMockSubscriptionCheckout({
            organizationId: 'org_1',
            simulatedOutcome: 'success',
            monthlyPriceTry: 649,
            monthlyCredits: 2000,
            planId: 'growth'
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null,
            changeType: 'upgrade',
            effectiveAt: null
        })
        expect(upgradeIyzicoSubscriptionMock).toHaveBeenCalledWith({
            subscriptionReferenceCode: 'sub_ref_starter',
            newPricingPlanReferenceCode: 'growth-plan-ref',
            upgradePeriod: 'NOW',
            resetRecurrenceCount: false
        })
        expect(serviceSupabase.spies.billingUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            monthly_package_credit_limit: 2000,
            monthly_package_credit_used: 150,
            current_period_start: '2026-03-01T00:00:00.000Z',
            current_period_end: '2026-04-01T00:00:00.000Z'
        }))
        expect(serviceSupabase.spies.subscriptionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            provider_subscription_id: 'sub_ref_growth',
            metadata: expect.objectContaining({
                change_type: 'upgrade',
                requested_monthly_credits: 2000,
                requested_monthly_price_try: 649
            })
        }))
        expect(serviceSupabase.spies.ledgerInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            entry_type: 'package_grant',
            credit_pool: 'package_pool',
            credits_delta: 1000,
            balance_after: 1870,
            metadata: expect.objectContaining({
                subscription_id: 'sub_row_1',
                change_type: 'upgrade',
                requested_monthly_credits: 2000
            })
        }))
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
