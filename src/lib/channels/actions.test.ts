import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    assertTenantWriteAllowedMock,
    createClientMock,
    getPhoneNumberMock,
    revalidatePathMock,
    whatsAppCtorMock
} = vi.hoisted(() => ({
    assertTenantWriteAllowedMock: vi.fn(),
    createClientMock: vi.fn(),
    getPhoneNumberMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    whatsAppCtorMock: vi.fn()
}))

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/organizations/active-context', () => ({
    assertTenantWriteAllowed: assertTenantWriteAllowedMock
}))

vi.mock('@/lib/whatsapp/client', () => ({
    WhatsAppClient: class {
        constructor(token: string) {
            whatsAppCtorMock(token)
        }

        getPhoneNumber = getPhoneNumberMock
    }
}))

import { connectWhatsAppChannel, debugWhatsAppChannel } from '@/lib/channels/actions'

function createUpsertSupabaseMock(upsertResult: { error: unknown } = { error: null }) {
    const upsertMock = vi.fn(async () => upsertResult)
    const fromMock = vi.fn((table: string) => {
        if (table !== 'channels') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            upsert: upsertMock
        }
    })

    return {
        supabase: {
            from: fromMock
        },
        upsertMock,
        fromMock
    }
}

function createDebugSupabaseMock(channelData: unknown) {
    const singleMock = vi.fn(async () => ({ data: channelData }))
    const eqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))
    const fromMock = vi.fn((table: string) => {
        if (table !== 'channels') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock
        }
    })

    return {
        supabase: {
            from: fromMock
        },
        fromMock,
        selectMock,
        eqMock,
        singleMock
    }
}

describe('channels actions: WhatsApp core flows', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
        getPhoneNumberMock.mockResolvedValue({
            display_phone_number: '+90 555 111 22 33',
            verified_name: 'Qualy',
            quality_rating: 'GREEN'
        })
    })

    it('returns validation error when required WhatsApp fields are missing', async () => {
        const { supabase } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await connectWhatsAppChannel('org-1', {
            phoneNumberId: '',
            businessAccountId: '',
            permanentAccessToken: '',
            appSecret: '',
            verifyToken: ''
        })

        expect(result).toEqual({ error: 'Missing required WhatsApp channel fields.' })
        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(whatsAppCtorMock).not.toHaveBeenCalled()
        expect(revalidatePathMock).not.toHaveBeenCalled()
    })

    it('upserts WhatsApp channel and revalidates channels settings on success', async () => {
        const { supabase, upsertMock } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await connectWhatsAppChannel('org-1', {
            phoneNumberId: 'phone-1',
            businessAccountId: 'biz-1',
            permanentAccessToken: 'token-1',
            appSecret: 'secret-1',
            verifyToken: 'verify-1'
        })

        expect(result).toEqual({ success: true })
        expect(whatsAppCtorMock).toHaveBeenCalledWith('token-1')
        expect(getPhoneNumberMock).toHaveBeenCalledWith('phone-1')
        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organization_id: 'org-1',
                type: 'whatsapp',
                name: 'WhatsApp (+90 555 111 22 33)',
                status: 'active',
                config: expect.objectContaining({
                    phone_number_id: 'phone-1',
                    business_account_id: 'biz-1',
                    permanent_access_token: 'token-1',
                    app_secret: 'secret-1',
                    verify_token: 'verify-1',
                    display_phone_number: '+90 555 111 22 33',
                    webhook_verified_at: null
                })
            }),
            { onConflict: 'organization_id,type' }
        )
        expect(revalidatePathMock).toHaveBeenCalledWith('/settings/channels')
    })

    it('returns normalized debug info for WhatsApp channel', async () => {
        const { supabase, eqMock } = createDebugSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            config: {
                permanent_access_token: 'token-1',
                phone_number_id: 'phone-1',
                verify_token: 'verify-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await debugWhatsAppChannel('channel-1')

        expect(eqMock).toHaveBeenCalledWith('id', 'channel-1')
        expect(getPhoneNumberMock).toHaveBeenCalledWith('phone-1')
        expect(result).toEqual({
            success: true,
            info: {
                phone_number_id: 'phone-1',
                verify_token_set: true,
                display_phone_number: '+90 555 111 22 33',
                verified_name: 'Qualy',
                quality_rating: 'GREEN'
            }
        })
    })
})
