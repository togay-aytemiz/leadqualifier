import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const { createServiceClientMock } = vi.hoisted(() => ({
    createServiceClientMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createServiceClientMock
}))

import { POST } from '@/app/api/billing/iyzico/card-update/callback/route'

function createServiceSupabaseMock(options?: {
    row?: Record<string, unknown> | null
}) {
    const maybeSingleMock = vi.fn(async () => ({
        data: options?.row ?? {
            id: 'sub_row_1',
            organization_id: 'org_1',
            metadata: {
                card_update_checkout_token: 'card_update_token_1'
            }
        },
        error: null
    }))
    const eqSecondMock = vi.fn(() => ({
        maybeSingle: maybeSingleMock
    }))
    const eqFirstMock = vi.fn(() => ({
        eq: eqSecondMock
    }))
    const selectMock = vi.fn(() => ({
        eq: eqFirstMock
    }))

    const updateEqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({
        eq: updateEqMock
    }))

    const fromMock = vi.fn(() => ({
        select: selectMock,
        update: updateMock
    }))

    return {
        supabase: {
            from: fromMock
        },
        spies: {
            updateMock,
            updateEqMock
        }
    }
}

describe('iyzico card update callback route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    it('persists callback payload and redirects back to plans with payment recovery status', async () => {
        const { supabase, spies } = createServiceSupabaseMock()
        createServiceClientMock.mockReturnValue(supabase)

        const req = new NextRequest('http://localhost/api/billing/iyzico/card-update/callback?recordId=sub_row_1&locale=tr', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                status: 'success',
                conversationId: 'sub_row_1',
                token: 'card_update_token_1'
            }).toString()
        })

        const res = await POST(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('payment_recovery_action=card_update')
        expect(res.headers.get('location')).toContain('payment_recovery_status=success')
        expect(spies.updateMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                last_card_update_callback_payload: expect.objectContaining({
                    status: 'success',
                    conversationId: 'sub_row_1',
                    token: 'card_update_token_1'
                }),
                card_update_checkout_token: null,
                card_update_checkout_form_content: null
            })
        }))
        expect(spies.updateEqMock).toHaveBeenCalledWith('id', 'sub_row_1')
    })

    it('rejects callbacks that do not prove the active card-update token', async () => {
        const { supabase, spies } = createServiceSupabaseMock()
        createServiceClientMock.mockReturnValue(supabase)

        const req = new NextRequest('http://localhost/api/billing/iyzico/card-update/callback?recordId=sub_row_1&locale=tr', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                status: 'success',
                conversationId: 'sub_row_1',
                token: 'wrong_token'
            }).toString()
        })

        const res = await POST(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('payment_recovery_status=error')
        expect(spies.updateMock).not.toHaveBeenCalled()
    })

    it('rejects callbacks whose conversation id does not match the subscription record id', async () => {
        const { supabase, spies } = createServiceSupabaseMock()
        createServiceClientMock.mockReturnValue(supabase)

        const req = new NextRequest('http://localhost/api/billing/iyzico/card-update/callback?recordId=sub_row_1&locale=tr', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                status: 'success',
                conversationId: 'other_row',
                token: 'card_update_token_1'
            }).toString()
        })

        const res = await POST(req)

        expect(res.status).toBe(307)
        expect(res.headers.get('location')).toContain('payment_recovery_status=error')
        expect(spies.updateMock).not.toHaveBeenCalled()
    })
})
