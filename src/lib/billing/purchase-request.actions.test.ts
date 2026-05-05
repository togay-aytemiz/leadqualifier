import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createBillingPurchaseRequest } from '@/lib/billing/purchase-request.actions'

const {
    createClientMock,
    getBillingPricingCatalogMock,
    sendBillingPurchaseRequestEmailMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    getBillingPricingCatalogMock: vi.fn(),
    sendBillingPurchaseRequestEmailMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/billing/pricing-catalog', async (importOriginal) => ({
    ...await importOriginal<typeof import('@/lib/billing/pricing-catalog')>(),
    getBillingPricingCatalog: getBillingPricingCatalogMock
}))

vi.mock('@/lib/billing/purchase-request-email', () => ({
    sendBillingPurchaseRequestEmail: sendBillingPurchaseRequestEmailMock
}))

function createSupabaseMock(options?: {
    userId?: string | null
    userEmail?: string | null
    membershipError?: unknown
    insertError?: unknown
    organization?: { name: string; billing_region: string | null } | null
    profile?: { full_name: string | null; email: string | null } | null
}) {
    const authGetUserMock = vi.fn(async () => ({
        data: {
            user: options?.userId === null
                ? null
                : {
                    id: options?.userId ?? 'user_1',
                    email: options?.userEmail ?? 'owner@example.com'
                }
        }
    }))
    const rpcMock = vi.fn(async () => ({ error: options?.membershipError ?? null }))

    const requestRow = {
        id: 'request_1',
        created_at: '2026-05-05T10:30:00.000Z'
    }
    const requestSingleMock = vi.fn(async () => ({
        data: requestRow,
        error: options?.insertError ?? null
    }))
    const requestSelectMock = vi.fn(() => ({ single: requestSingleMock }))
    const requestInsertMock = vi.fn(() => ({ select: requestSelectMock }))
    const requestUpdateEqMock = vi.fn(async () => ({ error: null }))
    const requestUpdateMock = vi.fn(() => ({ eq: requestUpdateEqMock }))

    const organizationMaybeSingleMock = vi.fn(async () => ({
        data: options?.organization === null
            ? null
            : (options?.organization ?? { name: 'Acme Clinic', billing_region: 'TR' }),
        error: null
    }))
    const organizationEqMock = vi.fn(() => ({ maybeSingle: organizationMaybeSingleMock }))
    const organizationSelectMock = vi.fn(() => ({ eq: organizationEqMock }))

    const profileMaybeSingleMock = vi.fn(async () => ({
        data: options?.profile === null
            ? null
            : (options?.profile ?? { full_name: 'Ada Lovelace', email: 'ada@example.com' }),
        error: null
    }))
    const profileEqMock = vi.fn(() => ({ maybeSingle: profileMaybeSingleMock }))
    const profileSelectMock = vi.fn(() => ({ eq: profileEqMock }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'billing_purchase_requests') {
            return {
                insert: requestInsertMock,
                update: requestUpdateMock
            }
        }
        if (table === 'organizations') {
            return { select: organizationSelectMock }
        }
        if (table === 'profiles') {
            return { select: profileSelectMock }
        }
        throw new Error(`Unexpected table: ${table}`)
    })

    return {
        supabase: {
            auth: { getUser: authGetUserMock },
            rpc: rpcMock,
            from: fromMock
        },
        spies: {
            rpcMock,
            requestInsertMock,
            requestUpdateMock
        }
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    process.env.NEXT_PUBLIC_APP_URL = 'https://app.askqualy.com'
    getBillingPricingCatalogMock.mockResolvedValue({
        trialCredits: 200,
        plans: [
            {
                id: 'starter',
                credits: 1000,
                priceTry: 349,
                priceUsd: 9.99,
                conversationRange: { min: 90, max: 120 }
            },
            {
                id: 'growth',
                credits: 2000,
                priceTry: 649,
                priceUsd: 17.99,
                conversationRange: { min: 180, max: 240 }
            },
            {
                id: 'scale',
                credits: 4000,
                priceTry: 949,
                priceUsd: 26.99,
                conversationRange: { min: 360, max: 480 }
            }
        ],
        topups: [
            {
                id: 'topup_500',
                credits: 500,
                priceTry: 189,
                priceUsd: 5.49,
                conversationRange: { min: 45, max: 60 }
            }
        ]
    })
    sendBillingPurchaseRequestEmailMock.mockResolvedValue({
        status: 'sent',
        error: null
    })
})

describe('createBillingPurchaseRequest', () => {
    it('stores a plan request and sends the admin email', async () => {
        const { supabase, spies } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const result = await createBillingPurchaseRequest({
            organizationId: 'org_1',
            requestType: 'plan',
            planId: 'growth',
            locale: 'tr'
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null,
            requestId: 'request_1',
            emailStatus: 'sent'
        })
        expect(spies.rpcMock).toHaveBeenCalledWith('assert_org_member_or_admin', {
            target_organization_id: 'org_1'
        })
        expect(spies.requestInsertMock).toHaveBeenCalledWith({
            organization_id: 'org_1',
            requested_by: 'user_1',
            request_type: 'plan',
            requested_plan_id: 'growth',
            requested_topup_pack_id: null,
            requested_credits: 2000,
            requested_amount: 649,
            requested_currency: 'TRY',
            status: 'new',
            email_status: 'not_configured',
            email_error: null,
            metadata: {
                locale: 'tr',
                source: 'settings_plans'
            }
        })
        expect(sendBillingPurchaseRequestEmailMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationName: 'Acme Clinic',
            requestedLabel: 'Growth',
            requestedCredits: 2000,
            requestedAmount: 649,
            requestedCurrency: 'TRY',
            adminUrl: 'https://app.askqualy.com/tr/admin/organizations/org_1'
        }))
        expect(spies.requestUpdateMock).toHaveBeenCalledWith({
            email_status: 'sent',
            email_error: null,
            updated_at: expect.any(String)
        })
    })

    it('stores a top-up request with the selected pack details', async () => {
        const { supabase, spies } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const result = await createBillingPurchaseRequest({
            organizationId: 'org_1',
            requestType: 'topup',
            topupPackId: 'topup_500',
            locale: 'en'
        })

        expect(result.ok).toBe(true)
        expect(spies.requestInsertMock).toHaveBeenCalledWith(expect.objectContaining({
            request_type: 'topup',
            requested_plan_id: null,
            requested_topup_pack_id: 'topup_500',
            requested_credits: 500,
            requested_amount: 189,
            requested_currency: 'TRY'
        }))
        expect(sendBillingPurchaseRequestEmailMock).toHaveBeenCalledWith(expect.objectContaining({
            requestedLabel: 'Top-up 500'
        }))
    })

    it('returns unauthorized when the user is not signed in', async () => {
        const { supabase } = createSupabaseMock({ userId: null })
        createClientMock.mockResolvedValue(supabase)

        const result = await createBillingPurchaseRequest({
            organizationId: 'org_1',
            requestType: 'plan',
            planId: 'growth',
            locale: 'tr'
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'unauthorized',
            requestId: null,
            emailStatus: null
        })
    })

    it('returns invalid_input for unknown plan ids', async () => {
        const { supabase } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)

        const result = await createBillingPurchaseRequest({
            organizationId: 'org_1',
            requestType: 'plan',
            planId: 'enterprise',
            locale: 'tr'
        })

        expect(result).toEqual({
            ok: false,
            status: 'error',
            error: 'invalid_input',
            requestId: null,
            emailStatus: null
        })
    })

    it('keeps the request successful when email sending fails', async () => {
        const { supabase, spies } = createSupabaseMock()
        createClientMock.mockResolvedValue(supabase)
        sendBillingPurchaseRequestEmailMock.mockResolvedValue({
            status: 'failed',
            error: 'Resend 422: Invalid sender domain'
        })

        const result = await createBillingPurchaseRequest({
            organizationId: 'org_1',
            requestType: 'plan_change',
            planId: 'starter',
            locale: 'tr'
        })

        expect(result).toEqual({
            ok: true,
            status: 'success',
            error: null,
            requestId: 'request_1',
            emailStatus: 'failed'
        })
        expect(spies.requestUpdateMock).toHaveBeenCalledWith({
            email_status: 'failed',
            email_error: 'Resend 422: Invalid sender domain',
            updated_at: expect.any(String)
        })
    })
})
