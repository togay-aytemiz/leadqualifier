import crypto from 'node:crypto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createServiceClientMock,
    retrieveIyzicoSubscriptionMock
} = vi.hoisted(() => ({
    createServiceClientMock: vi.fn(),
    retrieveIyzicoSubscriptionMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

vi.mock('@/lib/billing/providers/iyzico/client', () => ({
    retrieveIyzicoSubscription: retrieveIyzicoSubscriptionMock
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
            subscriptionUpdateEqMock,
            billingUpdateEqMock,
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
                metadata: {
                    requested_monthly_credits: 1000,
                    requested_monthly_price_try: 349
                }
            },
            billingRow: {
                organization_id: 'org_1',
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
                    startDate: 1760000000000,
                    endDate: 1762592000000
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
            next_period_start: expect.any(String),
            next_period_end: expect.any(String),
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
                    endDate
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
        expect(spies.billingUpdateEqMock).not.toHaveBeenCalled()
        expect(spies.ledgerInsertMock).not.toHaveBeenCalled()
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
                period_end: '2026-04-01T00:00:00.000Z',
                metadata: {
                    requested_monthly_credits: 1000
                }
            },
            billingRow: {
                organization_id: 'org_1',
                current_period_end: '2026-04-01T00:00:00.000Z',
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
