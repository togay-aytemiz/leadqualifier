import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createServiceClientMock,
    retrieveIyzicoSubscriptionCheckoutResultMock,
    retrieveIyzicoTopupCheckoutResultMock,
    upgradeIyzicoSubscriptionMock
} = vi.hoisted(() => ({
    createServiceClientMock: vi.fn(),
    retrieveIyzicoSubscriptionCheckoutResultMock: vi.fn(),
    retrieveIyzicoTopupCheckoutResultMock: vi.fn(),
    upgradeIyzicoSubscriptionMock: vi.fn()
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
        retrieveIyzicoSubscriptionCheckoutResult: retrieveIyzicoSubscriptionCheckoutResultMock,
        retrieveIyzicoTopupCheckoutResult: retrieveIyzicoTopupCheckoutResultMock,
        upgradeIyzicoSubscription: upgradeIyzicoSubscriptionMock,
        IyzicoClientError: MockIyzicoClientError
    }
})

import { GET } from '@/app/api/billing/iyzico/callback/route'
import { IyzicoClientError } from '@/lib/billing/providers/iyzico/client'

function createServiceSupabaseMock(options: {
    orderRow?: Record<string, unknown> | null
    subscriptionRow?: Record<string, unknown> | null
    billingAccountRow?: Record<string, unknown> | null
    rpcResult?: { data: unknown; error: unknown }
}) {
    const orderMaybeSingleMock = vi.fn(async () => ({
        data: options.orderRow ?? null,
        error: null
    }))
    const orderLimitMock = vi.fn(() => ({
        maybeSingle: orderMaybeSingleMock
    }))
    const orderSortMock = vi.fn(() => ({
        limit: orderLimitMock
    }))
    const orderEqSecondMock = vi.fn(() => ({
        order: orderSortMock
    }))
    const orderEqFirstMock = vi.fn(() => ({
        eq: orderEqSecondMock
    }))
    const orderSelectMock = vi.fn(() => ({
        eq: orderEqFirstMock
    }))
    const orderUpdateEqMock = vi.fn(async () => ({ error: null }))
    const orderUpdateMock = vi.fn(() => ({
        eq: orderUpdateEqMock
    }))

    const subscriptionMaybeSingleMock = vi.fn(async () => ({
        data: options.subscriptionRow ?? null,
        error: null
    }))
    const subscriptionLimitMock = vi.fn(() => ({
        maybeSingle: subscriptionMaybeSingleMock
    }))
    const subscriptionSortMock = vi.fn(() => ({
        limit: subscriptionLimitMock
    }))
    const subscriptionEqSecondMock = vi.fn(() => ({
        order: subscriptionSortMock
    }))
    const subscriptionEqFirstMock = vi.fn(() => ({
        eq: subscriptionEqSecondMock
    }))
    const subscriptionSelectMock = vi.fn(() => ({
        eq: subscriptionEqFirstMock
    }))
    const subscriptionUpdateEqMock = vi.fn(async () => ({ error: null }))
    const subscriptionUpdateMock = vi.fn(() => ({
        eq: subscriptionUpdateEqMock
    }))

    const billingMaybeSingleMock = vi.fn(async () => ({
        data: options.billingAccountRow ?? null,
        error: null
    }))
    const billingEqMock = vi.fn(() => ({
        maybeSingle: billingMaybeSingleMock
    }))
    const billingSelectMock = vi.fn(() => ({
        eq: billingEqMock
    }))
    const billingUpdateEqMock = vi.fn(async () => ({ error: null }))
    const billingUpdateMock = vi.fn(() => ({
        eq: billingUpdateEqMock
    }))

    const ledgerInsertMock = vi.fn(async () => ({ error: null }))
    const rpcMock = vi.fn(async () => options.rpcResult ?? {
        data: { ok: true, status: 'applied' },
        error: null
    })

    const fromMock = vi.fn((table: string) => {
        if (table === 'credit_purchase_orders') {
            return {
                select: orderSelectMock,
                update: orderUpdateMock
            }
        }

        if (table === 'organization_subscription_records') {
            return {
                select: subscriptionSelectMock,
                update: subscriptionUpdateMock
            }
        }

        if (table === 'organization_billing_accounts') {
            return {
                select: billingSelectMock,
                update: billingUpdateMock
            }
        }

        if (table === 'organization_credit_ledger') {
            return {
                insert: ledgerInsertMock
            }
        }

        throw new Error(`Unexpected table: ${table}`)
    })

    return {
        client: {
            from: fromMock,
            rpc: rpcMock
        },
        spies: {
            orderUpdateEqMock,
            orderUpdateMock,
            subscriptionUpdateEqMock,
            subscriptionUpdateMock,
            billingUpdateEqMock,
            billingUpdateMock,
            ledgerInsertMock,
            rpcMock
        }
    }
}

describe('iyzico callback route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    it('redirects with a mapped checkout error when subscription retrieve fails', async () => {
        const { client, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                status: 'pending',
                provider_subscription_id: null,
                metadata: {
                    checkout_locale: 'tr'
                }
            }
        })
        createServiceClientMock.mockReturnValue(client)
        retrieveIyzicoSubscriptionCheckoutResultMock.mockRejectedValue(
            new IyzicoClientError('request_failed', 'Kart limiti yetersiz, yetersiz bakiye', {
                providerErrorCode: '10051',
                providerErrorMessage: 'Kart limiti yetersiz, yetersiz bakiye'
            })
        )

        const req = new NextRequest('http://localhost/api/billing/iyzico/callback?action=subscribe&locale=tr&token=tok_1')
        const res = await GET(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('checkout_action=subscribe')
        expect(res.headers.get('location')).toContain('checkout_status=failed')
        expect(res.headers.get('location')).toContain('checkout_error=insufficient_funds')
        expect(spies.subscriptionUpdateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
    })

    it('finalizes a paid fixed-difference upgrade checkout and schedules next-period provider pricing', async () => {
        const { client, spies } = createServiceSupabaseMock({
            orderRow: {
                id: 'order_1',
                organization_id: 'org_1',
                status: 'pending',
                credits: 1000,
                amount_try: 300,
                metadata: {
                    source: 'iyzico_subscription_upgrade_checkout',
                    checkout_locale: 'tr',
                    checkout_action: 'subscribe',
                    change_type: 'upgrade',
                    conversation_id: 'subscription_change_sub_row_1_growth',
                    subscription_id: 'sub_row_1',
                    subscription_reference_code: 'sub_ref_starter',
                    target_pricing_plan_reference_code: 'growth-plan-ref',
                    requested_plan_id: 'growth',
                    requested_monthly_credits: 2000,
                    requested_monthly_price_try: 649,
                    current_monthly_price_try: 349,
                    credit_delta: 1000,
                    current_period_start: '2026-03-01T00:00:00.000Z',
                    current_period_end: '2026-04-01T00:00:00.000Z'
                }
            },
            billingAccountRow: {
                organization_id: 'org_1',
                monthly_package_credit_limit: 1000,
                monthly_package_credit_used: 150,
                topup_credit_balance: 20,
                premium_assigned_at: '2026-03-01T00:00:00.000Z'
            }
        })
        createServiceClientMock.mockReturnValue(client)
        retrieveIyzicoTopupCheckoutResultMock.mockResolvedValue({
            paymentStatus: 'SUCCESS',
            paymentId: '29520001',
            paymentConversationId: 'conv_upgrade_pay_1'
        })
        upgradeIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {}
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/callback?action=subscribe&locale=tr&token=tok_1')
        const res = await GET(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('checkout_action=subscribe')
        expect(res.headers.get('location')).toContain('checkout_status=success')
        expect(res.headers.get('location')).toContain('checkout_change_type=upgrade')
        expect(upgradeIyzicoSubscriptionMock).toHaveBeenCalledWith({
            conversationId: 'subscription_change_sub_row_1_growth',
            subscriptionReferenceCode: 'sub_ref_starter',
            newPricingPlanReferenceCode: 'growth-plan-ref',
            upgradePeriod: 'NEXT_PERIOD',
            resetRecurrenceCount: false
        })
        expect(spies.orderUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                payment_status: 'SUCCESS',
                payment_id: '29520001',
                upgrade_apply_status: 'scheduled',
                upgrade_schedule_response: expect.objectContaining({
                    status: 'success'
                })
            })
        }))
        expect(spies.rpcMock).toHaveBeenCalledWith('apply_iyzico_subscription_upgrade_checkout_success', expect.objectContaining({
            target_order_id: 'order_1',
            next_subscription_reference_code: 'sub_ref_starter',
            payment_conversation_id: 'conv_upgrade_pay_1'
        }))
    })

    it('does not report success for a paid upgrade order whose local apply already failed', async () => {
        const { client } = createServiceSupabaseMock({
            orderRow: {
                id: 'order_1',
                organization_id: 'org_1',
                status: 'paid',
                credits: 1000,
                amount_try: 300,
                metadata: {
                    source: 'iyzico_subscription_upgrade_checkout',
                    checkout_locale: 'tr',
                    checkout_action: 'subscribe',
                    change_type: 'upgrade',
                    upgrade_apply_status: 'failed'
                }
            }
        })
        createServiceClientMock.mockReturnValue(client)

        const req = new NextRequest('http://localhost/api/billing/iyzico/callback?action=subscribe&locale=tr&token=tok_1')
        const res = await GET(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('checkout_action=subscribe')
        expect(res.headers.get('location')).toContain('checkout_status=error')
        expect(res.headers.get('location')).toContain('checkout_change_type=upgrade')
    })

    it('reuses a previously scheduled upgrade response instead of calling the provider again on retry', async () => {
        const { client, spies } = createServiceSupabaseMock({
            orderRow: {
                id: 'order_1',
                organization_id: 'org_1',
                status: 'pending',
                credits: 1000,
                amount_try: 300,
                metadata: {
                    source: 'iyzico_subscription_upgrade_checkout',
                    checkout_locale: 'tr',
                    checkout_action: 'subscribe',
                    change_type: 'upgrade',
                    conversation_id: 'subscription_change_sub_row_1_growth',
                    subscription_id: 'sub_row_1',
                    subscription_reference_code: 'sub_ref_starter',
                    target_pricing_plan_reference_code: 'growth-plan-ref',
                    requested_plan_id: 'growth',
                    requested_monthly_credits: 2000,
                    requested_monthly_price_try: 649,
                    current_monthly_price_try: 349,
                    credit_delta: 1000,
                    current_period_start: '2026-03-01T00:00:00.000Z',
                    current_period_end: '2026-04-01T00:00:00.000Z',
                    payment_status: 'SUCCESS',
                    payment_id: '29520001',
                    payment_conversation_id: 'conv_upgrade_pay_1',
                    callback_retrieve_response: {
                        paymentStatus: 'SUCCESS',
                        paymentId: '29520001',
                        paymentConversationId: 'conv_upgrade_pay_1'
                    },
                    upgrade_apply_status: 'scheduled',
                    upgrade_schedule_response: {
                        status: 'success',
                        data: {}
                    }
                }
            }
        })
        createServiceClientMock.mockReturnValue(client)

        const req = new NextRequest('http://localhost/api/billing/iyzico/callback?action=subscribe&locale=tr&token=tok_1')
        const res = await GET(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('checkout_status=success')
        expect(upgradeIyzicoSubscriptionMock).not.toHaveBeenCalled()
        expect(retrieveIyzicoTopupCheckoutResultMock).not.toHaveBeenCalled()
        expect(spies.rpcMock).toHaveBeenCalledWith('apply_iyzico_subscription_upgrade_checkout_success', expect.objectContaining({
            target_order_id: 'order_1'
        }))
    })
})
