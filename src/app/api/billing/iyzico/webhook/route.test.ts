import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createServiceClientMock,
    retrieveIyzicoSubscriptionMock,
    retrieveIyzicoPaymentMock
} = vi.hoisted(() => ({
    createServiceClientMock: vi.fn(),
    retrieveIyzicoSubscriptionMock: vi.fn(),
    retrieveIyzicoPaymentMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

vi.mock('@/lib/billing/providers/iyzico/client', () => ({
    retrieveIyzicoSubscription: retrieveIyzicoSubscriptionMock,
    retrieveIyzicoPayment: retrieveIyzicoPaymentMock
}))

import { POST } from '@/app/api/billing/iyzico/webhook/route'

function buildSignature(input: {
    secretKey: string
    merchantId: string
    eventType: string
    subscriptionReferenceCode: string
    orderReferenceCode: string
    customerReferenceCode: string
}) {
    const payload = [
        input.secretKey,
        input.merchantId,
        input.eventType,
        input.subscriptionReferenceCode,
        input.orderReferenceCode,
        input.customerReferenceCode
    ].join('')

    return crypto.createHmac('sha256', input.secretKey).update(payload).digest('hex')
}

function createServiceSupabaseMock(options: {
    subscriptionRow?: Record<string, unknown> | null
    billingRow?: Record<string, unknown> | null
    ledgerRows?: Array<Record<string, unknown>> | null
    rpcResult?: { data: unknown; error: unknown }
}) {
    const subscriptionMaybeSingleMock = vi.fn(async () => ({
        data: options.subscriptionRow ?? null,
        error: null
    }))
    const subscriptionLimitMock = vi.fn(() => ({
        maybeSingle: subscriptionMaybeSingleMock
    }))
    const subscriptionOrderMock = vi.fn(() => ({
        limit: subscriptionLimitMock
    }))
    const subscriptionEqSecondMock = vi.fn(() => ({
        order: subscriptionOrderMock
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
        data: options.billingRow ?? null,
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

    const ledgerLimitMock = vi.fn(async () => ({
        data: options.ledgerRows ?? [],
        error: null
    }))
    const ledgerOrderMock = vi.fn(() => ({
        limit: ledgerLimitMock
    }))
    const ledgerEqSecondMock = vi.fn(() => ({
        order: ledgerOrderMock
    }))
    const ledgerEqFirstMock = vi.fn(() => ({
        eq: ledgerEqSecondMock
    }))
    const ledgerSelectMock = vi.fn(() => ({
        eq: ledgerEqFirstMock
    }))
    const ledgerUpdateEqMock = vi.fn(async () => ({ error: null }))
    const ledgerUpdateMock = vi.fn(() => ({
        eq: ledgerUpdateEqMock
    }))
    const ledgerInsertMock = vi.fn(async () => ({ error: null }))
    const rpcMock = vi.fn(async () => (
        options.rpcResult ?? {
            data: {
                ok: true,
                status: 'applied'
            },
            error: null
        }
    ))

    const fromMock = vi.fn((table: string) => {
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
                select: ledgerSelectMock,
                update: ledgerUpdateMock,
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
            fromMock,
            subscriptionUpdateMock,
            subscriptionUpdateEqMock,
            billingUpdateEqMock,
            ledgerSelectMock,
            ledgerUpdateMock,
            ledgerUpdateEqMock,
            ledgerInsertMock,
            rpcMock
        }
    }
}

describe('iyzico webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
        process.env.IYZICO_SECRET_KEY = 'secret-key'
    })

    it('rejects invalid signatures', async () => {
        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': 'invalid'
            },
            body: JSON.stringify({
                merchantId: 'merchant_1',
                iyziEventType: 'subscription.order.success',
                subscriptionReferenceCode: 'sub_ref_1',
                orderReferenceCode: 'order_ref_1',
                customerReferenceCode: 'customer_ref_1'
            })
        })

        const res = await POST(req)

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
    })

    it('applies renewal success and resets the monthly package grant', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'active',
                period_end: '2026-04-02T19:44:00.000Z',
                metadata: {
                    requested_monthly_credits: 1000,
                    requested_monthly_price_try: 349
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: '2026-04-02T19:44:00.000Z',
                topup_credit_balance: 100,
                premium_assigned_at: '2026-02-01T00:00:00.000Z'
            }
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        retrieveIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {
                items: [{
                    referenceCode: 'sub_ref_1',
                    status: 'ACTIVE',
                    startDate: Date.UTC(2026, 0, 1, 0, 0, 0),
                    endDate: Date.UTC(2027, 0, 1, 0, 0, 0),
                    orders: [{
                        referenceCode: 'order_ref_renew_1',
                        price: 349,
                        currencyCode: 'TRY',
                        orderStatus: 'SUCCESS',
                        startPeriod: Date.UTC(2026, 3, 2, 19, 44, 0),
                        endPeriod: Date.UTC(2026, 4, 2, 19, 44, 0)
                    }]
                }]
            }
        })
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_renew_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(retrieveIyzicoSubscriptionMock).toHaveBeenCalledWith({
            subscriptionReferenceCode: 'sub_ref_1'
        })
        expect(spies.rpcMock).toHaveBeenCalledWith('apply_iyzico_subscription_renewal_success', expect.objectContaining({
            target_subscription_record_id: 'sub_row_1',
            target_order_reference_code: 'order_ref_renew_1',
            next_period_start: '2026-04-02T19:44:00.000Z',
            next_period_end: '2026-05-02T19:44:00.000Z',
            requested_monthly_credits: 1000,
            requested_monthly_price_try: 349
        }))
        expect(spies.subscriptionUpdateEqMock).not.toHaveBeenCalled()
        expect(spies.billingUpdateEqMock).not.toHaveBeenCalled()
        expect(spies.ledgerInsertMock).not.toHaveBeenCalled()
    })

    it('treats duplicate renewal success events as idempotent', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'active',
                metadata: {
                    requested_monthly_credits: 1000,
                    last_renewal_order_reference_code: 'order_ref_renew_1'
                }
            },
            billingRow: {
                organization_id: 'org_1',
                topup_credit_balance: 100
            }
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_renew_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, status: 'ignored' })
        expect(retrieveIyzicoSubscriptionMock).not.toHaveBeenCalled()
        expect(spies.subscriptionUpdateEqMock).not.toHaveBeenCalled()
        expect(spies.billingUpdateEqMock).not.toHaveBeenCalled()
        expect(spies.ledgerInsertMock).not.toHaveBeenCalled()
    })

    it('does not double-grant the initial activation period when callback already applied it', async () => {
        const startDate = Date.UTC(2025, 9, 9, 0, 0, 0)
        const endDate = Date.UTC(2025, 10, 8, 0, 0, 0)

        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'active',
                period_end: new Date(endDate).toISOString(),
                metadata: {
                    requested_monthly_credits: 1000,
                    callback_processed_at: '2025-10-09T00:00:00.000Z'
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: new Date(endDate).toISOString(),
                topup_credit_balance: 100
            },
            rpcResult: {
                data: {
                    ok: true,
                    status: 'ignored'
                },
                error: null
            }
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        retrieveIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {
                items: [{
                    referenceCode: 'sub_ref_1',
                    status: 'ACTIVE',
                    startDate,
                    endDate,
                    orders: [{
                        referenceCode: 'order_ref_initial_1',
                        price: 649,
                        currencyCode: 'TRY',
                        orderStatus: 'SUCCESS',
                        startPeriod: startDate,
                        endPeriod: endDate
                    }]
                }]
            }
        })
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_initial_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, status: 'ignored' })
        expect(spies.rpcMock).not.toHaveBeenCalled()
        expect(spies.billingUpdateEqMock).not.toHaveBeenCalled()
        expect(spies.ledgerInsertMock).not.toHaveBeenCalled()
    })

    it('recovers a same-cycle successful retry without reapplying a renewal grant', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'past_due',
                period_end: '2026-05-02T19:44:00.000Z',
                metadata: {
                    requested_monthly_credits: 1000,
                    requested_monthly_price_try: 349,
                    last_failed_order_reference_code: 'order_ref_failed_1'
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: '2026-05-02T19:44:00.000Z',
                topup_credit_balance: 100,
                premium_assigned_at: '2026-02-01T00:00:00.000Z'
            }
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        retrieveIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {
                items: [{
                    referenceCode: 'sub_ref_1',
                    status: 'ACTIVE',
                    startDate: Date.UTC(2026, 0, 1, 0, 0, 0),
                    endDate: Date.UTC(2027, 0, 1, 0, 0, 0),
                    orders: [{
                        referenceCode: 'order_ref_retry_1',
                        price: 349,
                        currencyCode: 'TRY',
                        orderStatus: 'SUCCESS',
                        startPeriod: Date.UTC(2026, 3, 2, 19, 44, 0),
                        endPeriod: Date.UTC(2026, 4, 2, 19, 44, 0)
                    }]
                }]
            }
        })
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            iyziReferenceCode: 'event_ref_retry_1',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_retry_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, status: 'recovered' })
        expect(spies.rpcMock).not.toHaveBeenCalled()
        expect(spies.subscriptionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            status: 'active',
            metadata: expect.objectContaining({
                payment_status: 'paid',
                last_paid_order_reference_code: 'order_ref_retry_1',
                last_paid_event_reference_code: 'event_ref_retry_1',
                last_paid_order_amount_try: 349,
                last_failed_order_reference_code: null
            })
        }))
        expect(spies.billingUpdateEqMock).toHaveBeenCalledWith('organization_id', 'org_1')
        expect(spies.ledgerInsertMock).not.toHaveBeenCalled()
    })

    it('backfills the exact provider charge for same-cycle upgrades without treating them as renewals', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'active',
                period_end: '2026-05-02T19:44:00.000Z',
                metadata: {
                    change_type: 'upgrade',
                    requested_monthly_credits: 2000,
                    requested_monthly_price_try: 649,
                    upgraded_at: '2026-04-02T19:44:00.000Z'
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: '2026-05-02T19:44:00.000Z',
                topup_credit_balance: 100,
                premium_assigned_at: '2026-02-01T00:00:00.000Z'
            },
            ledgerRows: [{
                id: 'ledger_1',
                reason: 'Iyzico subscription upgrade success',
                metadata: {
                    subscription_id: 'sub_row_1',
                    change_type: 'upgrade',
                    charged_amount_try: 300
                }
            }]
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        retrieveIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {
                referenceCode: 'sub_ref_1',
                subscriptionStatus: 'UPGRADED',
                startDate: Date.UTC(2026, 0, 1, 0, 0, 0),
                endDate: Date.UTC(2027, 0, 1, 0, 0, 0),
                orders: [{
                    referenceCode: 'order_ref_upgrade_1',
                    price: 325,
                    currencyCode: 'TRY',
                    orderStatus: 'SUCCESS',
                    startPeriod: Date.UTC(2026, 3, 2, 19, 44, 0),
                    endPeriod: Date.UTC(2026, 4, 2, 19, 44, 0)
                }]
            }
        })
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            iyziReferenceCode: 'event_ref_upgrade_1',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_upgrade_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, status: 'ignored' })
        expect(spies.rpcMock).not.toHaveBeenCalled()
        expect(spies.ledgerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                charged_amount_try: 325,
                order_reference_code: 'order_ref_upgrade_1'
            })
        }))
        expect(spies.ledgerUpdateEqMock).toHaveBeenCalledWith('id', 'ledger_1')
    })

    it('prefers payment detail paidPrice when an upgrade order price differs from the collected transaction amount', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_growth',
                status: 'active',
                period_end: '2026-05-08T13:27:00.000Z',
                metadata: {
                    change_type: 'upgrade',
                    requested_monthly_credits: 2000,
                    requested_monthly_price_try: 649,
                    upgraded_at: '2026-04-08T13:27:00.000Z'
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: '2026-05-08T13:27:00.000Z',
                topup_credit_balance: 100,
                premium_assigned_at: '2026-04-08T13:25:00.000Z'
            },
            ledgerRows: [{
                id: 'ledger_upgrade_1',
                reason: 'Iyzico subscription upgrade success',
                metadata: {
                    subscription_id: 'sub_row_1',
                    change_type: 'upgrade'
                }
            }]
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        retrieveIyzicoSubscriptionMock.mockResolvedValue({
            status: 'success',
            data: {
                referenceCode: 'sub_ref_growth',
                subscriptionStatus: 'UPGRADED',
                startDate: Date.UTC(2026, 3, 8, 13, 27, 0),
                endDate: Date.UTC(2026, 4, 8, 13, 27, 0),
                orders: [{
                    referenceCode: 'order_ref_upgrade_649',
                    price: 349,
                    currencyCode: 'TRY',
                    orderStatus: 'SUCCESS',
                    startPeriod: Date.UTC(2026, 3, 8, 13, 27, 0),
                    endPeriod: Date.UTC(2026, 4, 8, 13, 27, 0),
                    paymentAttempts: [{
                        conversationId: '20c4e63d-1111-db923',
                        paymentId: 29512645,
                        paymentStatus: 'SUCCESS'
                    }]
                }]
            }
        })
        retrieveIyzicoPaymentMock.mockResolvedValue({
            status: 'success',
            paymentId: '29512645',
            price: 649,
            paidPrice: 649,
            currency: 'TRY',
            paymentStatus: 'SUCCESS'
        })
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.success',
            iyziReferenceCode: 'event_ref_upgrade_649',
            subscriptionReferenceCode: 'sub_ref_growth',
            orderReferenceCode: 'order_ref_upgrade_649',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true, status: 'ignored' })
        expect(retrieveIyzicoPaymentMock).toHaveBeenCalledWith({
            locale: 'tr',
            paymentId: '29512645'
        })
        expect(spies.ledgerUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                charged_amount_try: 649,
                order_reference_code: 'order_ref_upgrade_649',
                payment_id: '29512645'
            })
        }))
        expect(spies.ledgerUpdateEqMock).toHaveBeenCalledWith('id', 'ledger_upgrade_1')
    })

    it('marks subscription as past_due on renewal failure', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'active',
                metadata: {
                    requested_monthly_credits: 1000
                }
            },
            billingRow: {
                organization_id: 'org_1',
                topup_credit_balance: 100
            }
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.order.failure',
            iyziReferenceCode: 'event_ref_1',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_failed_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(spies.subscriptionUpdateMock).toHaveBeenCalledWith(expect.objectContaining({
            status: 'past_due',
            metadata: expect.objectContaining({
                last_failed_order_reference_code: 'order_ref_failed_1',
                last_failed_event_reference_code: 'event_ref_1',
                payment_status: 'failed'
            })
        }))
        expect(spies.subscriptionUpdateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
        expect(spies.billingUpdateEqMock).toHaveBeenCalledWith('organization_id', 'org_1')
        expect(spies.ledgerInsertMock).not.toHaveBeenCalled()
    })

    it('keeps access active until period end when provider-side cancellation arrives before renewal boundary', async () => {
        const { client: serviceSupabase, spies } = createServiceSupabaseMock({
            subscriptionRow: {
                id: 'sub_row_1',
                organization_id: 'org_1',
                provider_subscription_id: 'sub_ref_1',
                status: 'active',
                period_end: '2099-04-01T00:00:00.000Z',
                metadata: {
                    requested_monthly_credits: 1000
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: '2099-04-01T00:00:00.000Z',
                topup_credit_balance: 100
            }
        })
        createServiceClientMock.mockReturnValue(serviceSupabase)
        const body = {
            merchantId: 'merchant_1',
            iyziEventType: 'subscription.canceled',
            subscriptionReferenceCode: 'sub_ref_1',
            orderReferenceCode: 'order_ref_cancel_1',
            customerReferenceCode: 'customer_ref_1'
        }
        const signature = buildSignature({
            secretKey: 'secret-key',
            merchantId: body.merchantId,
            eventType: body.iyziEventType,
            subscriptionReferenceCode: body.subscriptionReferenceCode,
            orderReferenceCode: body.orderReferenceCode,
            customerReferenceCode: body.customerReferenceCode
        })

        const req = new NextRequest('http://localhost/api/billing/iyzico/webhook', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-iyz-signature-v3': signature
            },
            body: JSON.stringify(body)
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(spies.subscriptionUpdateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
        expect(spies.billingUpdateEqMock).not.toHaveBeenCalled()
    })
})
