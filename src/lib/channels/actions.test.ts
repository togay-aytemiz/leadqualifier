import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    assertTenantWriteAllowedMock,
    createClientMock,
    exchangeMetaCodeForTokenMock,
    exchangeMetaForLongLivedTokenMock,
    getPhoneNumberMock,
    getMessageTemplatesMock,
    revalidatePathMock,
    sendTemplateMock,
    whatsAppCtorMock
} = vi.hoisted(() => ({
    assertTenantWriteAllowedMock: vi.fn(),
    createClientMock: vi.fn(),
    exchangeMetaCodeForTokenMock: vi.fn(),
    exchangeMetaForLongLivedTokenMock: vi.fn(),
    getPhoneNumberMock: vi.fn(),
    getMessageTemplatesMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    sendTemplateMock: vi.fn(),
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

vi.mock('@/lib/channels/meta-oauth', () => ({
    exchangeMetaCodeForToken: exchangeMetaCodeForTokenMock,
    exchangeMetaForLongLivedToken: exchangeMetaForLongLivedTokenMock
}))

vi.mock('@/lib/whatsapp/client', () => ({
    WhatsAppClient: class {
        constructor(token: string) {
            whatsAppCtorMock(token)
        }

        getPhoneNumber = getPhoneNumberMock
        getMessageTemplates = getMessageTemplatesMock
        sendTemplate = sendTemplateMock
    }
}))

import {
    completeWhatsAppEmbeddedSignupChannel,
    connectWhatsAppChannel,
    debugWhatsAppChannel,
    listWhatsAppMessageTemplates,
    sendWhatsAppTemplateMessage
} from '@/lib/channels/actions'

function createUpsertSupabaseMock(upsertResult: { error: unknown } = { error: null }) {
    const upsertMock = vi.fn(async () => upsertResult)
    const rpcMock = vi.fn(async () => ({ data: { eligible: true }, error: null }))
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
            from: fromMock,
            rpc: rpcMock
        },
        upsertMock,
        fromMock,
        rpcMock
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
        process.env.META_APP_ID = 'meta-app-1'
        process.env.META_APP_SECRET = 'meta-secret-1'
        process.env.META_WEBHOOK_VERIFY_TOKEN = 'global-verify-token'
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
        exchangeMetaCodeForTokenMock.mockResolvedValue('short-token-1')
        exchangeMetaForLongLivedTokenMock.mockResolvedValue('long-token-1')
        getPhoneNumberMock.mockResolvedValue({
            display_phone_number: '+90 555 111 22 33',
            verified_name: 'Qualy',
            quality_rating: 'GREEN'
        })
        getMessageTemplatesMock.mockResolvedValue({
            data: [
                {
                    id: 'tpl-1',
                    name: 'hello_world',
                    status: 'APPROVED',
                    language: 'en_US',
                    category: 'UTILITY'
                }
            ]
        })
        sendTemplateMock.mockResolvedValue({
            messages: [{ id: 'wamid.template.1' }]
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
        const { supabase, upsertMock, rpcMock } = createUpsertSupabaseMock()
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
        expect(rpcMock).toHaveBeenCalledWith('enforce_org_trial_business_policy', {
            target_organization_id: 'org-1',
            input_whatsapp_business_account_id: 'biz-1',
            input_phone: '+90 555 111 22 33',
            input_source: 'whatsapp_connect'
        })
        expect(revalidatePathMock).toHaveBeenCalledWith('/settings/channels')
    })

    it('completes embedded signup by exchanging code and upserting the WhatsApp channel', async () => {
        const { supabase, upsertMock, rpcMock } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await completeWhatsAppEmbeddedSignupChannel('org-1', {
            authCode: 'auth-code-1',
            phoneNumberId: 'phone-1',
            businessAccountId: 'waba-1'
        })

        expect(result).toEqual({ success: true })
        expect(exchangeMetaCodeForTokenMock).toHaveBeenCalledWith({
            appId: 'meta-app-1',
            appSecret: 'meta-secret-1',
            redirectUri: '',
            code: 'auth-code-1'
        })
        expect(exchangeMetaForLongLivedTokenMock).toHaveBeenCalledWith({
            appId: 'meta-app-1',
            appSecret: 'meta-secret-1',
            shortLivedToken: 'short-token-1'
        })
        expect(whatsAppCtorMock).toHaveBeenCalledWith('long-token-1')
        expect(getPhoneNumberMock).toHaveBeenCalledWith('phone-1')
        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organization_id: 'org-1',
                type: 'whatsapp',
                name: 'WhatsApp (+90 555 111 22 33)',
                status: 'active',
                config: expect.objectContaining({
                    phone_number_id: 'phone-1',
                    business_account_id: 'waba-1',
                    permanent_access_token: 'long-token-1',
                    verify_token: 'global-verify-token',
                    connected_via: 'embedded_signup',
                    display_phone_number: '+90 555 111 22 33',
                    webhook_verified_at: null
                })
            }),
            { onConflict: 'organization_id,type' }
        )
        expect(rpcMock).toHaveBeenCalledWith('enforce_org_trial_business_policy', {
            target_organization_id: 'org-1',
            input_whatsapp_business_account_id: 'waba-1',
            input_phone: '+90 555 111 22 33',
            input_source: 'whatsapp_connect'
        })
    })

    it('uses whatsapp-specific app credentials for embedded signup when provided', async () => {
        process.env.META_APP_ID = 'shared-meta-app-id'
        process.env.META_APP_SECRET = 'shared-meta-app-secret'
        process.env.META_WHATSAPP_APP_ID = 'whatsapp-app-id'
        process.env.META_WHATSAPP_APP_SECRET = 'whatsapp-app-secret'

        const { supabase } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        await completeWhatsAppEmbeddedSignupChannel('org-1', {
            authCode: 'auth-code-1',
            phoneNumberId: 'phone-1',
            businessAccountId: 'waba-1'
        })

        expect(exchangeMetaCodeForTokenMock).toHaveBeenCalledWith({
            appId: 'whatsapp-app-id',
            appSecret: 'whatsapp-app-secret',
            redirectUri: '',
            code: 'auth-code-1'
        })
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

    it('lists message templates for a connected WhatsApp channel', async () => {
        const { supabase, eqMock } = createDebugSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            config: {
                permanent_access_token: 'token-1',
                business_account_id: 'waba-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await listWhatsAppMessageTemplates('channel-1')

        expect(eqMock).toHaveBeenCalledWith('id', 'channel-1')
        expect(whatsAppCtorMock).toHaveBeenCalledWith('token-1')
        expect(getMessageTemplatesMock).toHaveBeenCalledWith('waba-1')
        expect(result).toEqual({
            success: true,
            templates: [
                {
                    id: 'tpl-1',
                    name: 'hello_world',
                    status: 'APPROVED',
                    language: 'en_US',
                    category: 'UTILITY'
                }
            ]
        })
    })

    it('returns validation error when listing templates on non-whatsapp channels', async () => {
        const { supabase } = createDebugSupabaseMock({
            id: 'channel-1',
            type: 'telegram',
            config: {}
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await listWhatsAppMessageTemplates('channel-1')

        expect(result).toEqual({ success: false, error: 'Channel not found or not whatsapp' })
        expect(getMessageTemplatesMock).not.toHaveBeenCalled()
    })

    it('sends template message using channel credentials', async () => {
        const { supabase, eqMock } = createDebugSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            config: {
                permanent_access_token: 'token-1',
                phone_number_id: 'phone-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await sendWhatsAppTemplateMessage({
            channelId: 'channel-1',
            to: '905551112233',
            templateName: 'appointment_reminder',
            languageCode: 'tr',
            bodyParameters: ['Togay', 'yarın 16:00']
        })

        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(eqMock).toHaveBeenCalledWith('id', 'channel-1')
        expect(sendTemplateMock).toHaveBeenCalledWith({
            phoneNumberId: 'phone-1',
            to: '905551112233',
            templateName: 'appointment_reminder',
            languageCode: 'tr',
            bodyParameters: ['Togay', 'yarın 16:00']
        })
        expect(result).toEqual({
            success: true,
            messageId: 'wamid.template.1'
        })
    })

    it('returns validation error when send template fields are missing', async () => {
        const { supabase } = createDebugSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            config: {
                permanent_access_token: 'token-1',
                phone_number_id: 'phone-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await sendWhatsAppTemplateMessage({
            channelId: 'channel-1',
            to: '',
            templateName: '',
            languageCode: '',
            bodyParameters: []
        })

        expect(result).toEqual({ success: false, error: 'Missing required template message fields.' })
        expect(sendTemplateMock).not.toHaveBeenCalled()
    })
})
