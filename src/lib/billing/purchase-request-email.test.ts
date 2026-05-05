import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sendBillingPurchaseRequestEmail } from '@/lib/billing/purchase-request-email'

const originalFetch = global.fetch

const emailInput = {
    organizationName: 'Acme Clinic',
    organizationId: 'org_1',
    requesterName: 'Ada Lovelace',
    requesterEmail: 'ada@example.com',
    requestType: 'plan',
    requestedLabel: 'Growth',
    requestedCredits: 2000,
    requestedAmount: 649,
    requestedCurrency: 'TRY' as const,
    locale: 'tr',
    createdAt: '2026-05-05T10:30:00.000Z',
    adminUrl: 'https://app.askqualy.com/tr/admin/organizations/org_1'
}

describe('sendBillingPurchaseRequestEmail', () => {
    beforeEach(() => {
        vi.restoreAllMocks()
        process.env.RESEND_API_KEY = ''
        process.env.BILLING_REQUEST_EMAIL_TO = ''
        process.env.BILLING_REQUEST_EMAIL_FROM = ''
        global.fetch = originalFetch
    })

    it('returns not_configured when Resend env vars are missing', async () => {
        const fetchMock = vi.fn()
        global.fetch = fetchMock as never

        const result = await sendBillingPurchaseRequestEmail(emailInput)

        expect(result).toEqual({
            status: 'not_configured',
            error: null
        })
        expect(fetchMock).not.toHaveBeenCalled()
    })

    it('sends a Resend email with purchase request details', async () => {
        process.env.RESEND_API_KEY = 'resend_key'
        process.env.BILLING_REQUEST_EMAIL_TO = 'admin@askqualy.com'
        process.env.BILLING_REQUEST_EMAIL_FROM = 'Qualy <notifications@askqualy.com>'
        const fetchMock = vi.fn(async () => ({
            ok: true,
            json: async () => ({ id: 'email_1' })
        }))
        global.fetch = fetchMock as never

        const result = await sendBillingPurchaseRequestEmail(emailInput)

        expect(result).toEqual({
            status: 'sent',
            error: null
        })
        expect(fetchMock).toHaveBeenCalledWith('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                Authorization: 'Bearer resend_key',
                'Content-Type': 'application/json'
            },
            body: expect.any(String)
        })
        const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body as string)
        expect(body).toMatchObject({
            from: 'Qualy <notifications@askqualy.com>',
            to: ['admin@askqualy.com'],
            subject: 'Qualy purchase request: Acme Clinic - Growth'
        })
        expect(body.text).toContain('Organization: Acme Clinic (org_1)')
        expect(body.text).toContain('Requester: Ada Lovelace <ada@example.com>')
        expect(body.text).toContain('Request: Growth')
        expect(body.text).toContain('Admin: https://app.askqualy.com/tr/admin/organizations/org_1')
    })

    it('returns failed with a short error when Resend rejects the message', async () => {
        process.env.RESEND_API_KEY = 'resend_key'
        process.env.BILLING_REQUEST_EMAIL_TO = 'admin@askqualy.com'
        process.env.BILLING_REQUEST_EMAIL_FROM = 'Qualy <notifications@askqualy.com>'
        const fetchMock = vi.fn(async () => ({
            ok: false,
            status: 422,
            text: async () => 'Invalid sender domain'
        }))
        global.fetch = fetchMock as never

        const result = await sendBillingPurchaseRequestEmail(emailInput)

        expect(result).toEqual({
            status: 'failed',
            error: 'Resend 422: Invalid sender domain'
        })
    })
})
