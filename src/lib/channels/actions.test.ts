import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    assertTenantWriteAllowedMock,
    createClientMock,
    deregisterPhoneNumberMock,
    exchangeMetaCodeForTokenMock,
    exchangeMetaForLongLivedTokenMock,
    getPhoneNumberMock,
    getMessageTemplatesMock,
    revalidatePathMock,
    registerPhoneNumberMock,
    resolveMetaInstagramConnectionCandidateMock,
    resolveMetaWhatsAppConnectionCandidateMock,
    sendTemplateMock,
    subscribeAppToBusinessAccountMock,
    whatsAppCtorMock
} = vi.hoisted(() => ({
    assertTenantWriteAllowedMock: vi.fn(),
    createClientMock: vi.fn(),
    deregisterPhoneNumberMock: vi.fn(),
    exchangeMetaCodeForTokenMock: vi.fn(),
    exchangeMetaForLongLivedTokenMock: vi.fn(),
    getPhoneNumberMock: vi.fn(),
    getMessageTemplatesMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    registerPhoneNumberMock: vi.fn(),
    resolveMetaInstagramConnectionCandidateMock: vi.fn(),
    resolveMetaWhatsAppConnectionCandidateMock: vi.fn(),
    sendTemplateMock: vi.fn(),
    subscribeAppToBusinessAccountMock: vi.fn(),
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
    exchangeMetaForLongLivedToken: exchangeMetaForLongLivedTokenMock,
    resolveMetaInstagramConnectionCandidate: resolveMetaInstagramConnectionCandidateMock,
    resolveMetaWhatsAppConnectionCandidate: resolveMetaWhatsAppConnectionCandidateMock
}))

vi.mock('@/lib/whatsapp/client', () => ({
    WhatsAppClient: class {
        constructor(token: string) {
            whatsAppCtorMock(token)
        }

        getPhoneNumber = getPhoneNumberMock
        getMessageTemplates = getMessageTemplatesMock
        deregisterPhoneNumber = deregisterPhoneNumberMock
        registerPhoneNumber = registerPhoneNumberMock
        sendTemplate = sendTemplateMock
        subscribeAppToBusinessAccount = subscribeAppToBusinessAccountMock
    }
}))

import {
    completeWhatsAppEmbeddedSignupChannel,
    connectWhatsAppChannel,
    debugInstagramChannel,
    debugWhatsAppChannel,
    disconnectChannel,
    listWhatsAppMessageTemplates,
    retryWhatsAppWebhookVerification,
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

function createDisconnectSupabaseMock(channelData: unknown, deleteResult: { error: unknown } = { error: null }) {
    const singleMock = vi.fn(async () => ({ data: channelData }))
    const selectEqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: selectEqMock }))
    const deleteEqMock = vi.fn(async () => deleteResult)
    const deleteMock = vi.fn(() => ({ eq: deleteEqMock }))
    const fromMock = vi.fn((table: string) => {
        if (table !== 'channels') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock,
            delete: deleteMock
        }
    })

    return {
        supabase: {
            from: fromMock
        },
        fromMock,
        selectMock,
        selectEqMock,
        singleMock,
        deleteMock,
        deleteEqMock
    }
}

function createRetryWebhookSupabaseMock(channelData: unknown, updateResult: { error: unknown } = { error: null }) {
    const singleMock = vi.fn(async () => ({ data: channelData }))
    const selectEqMock = vi.fn(() => ({ single: singleMock }))
    const selectMock = vi.fn(() => ({ eq: selectEqMock }))
    const updateEqMock = vi.fn(async () => updateResult)
    const updateMock = vi.fn(() => ({ eq: updateEqMock }))
    const fromMock = vi.fn((table: string) => {
        if (table !== 'channels') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock,
            update: updateMock
        }
    })

    return {
        supabase: {
            from: fromMock
        },
        fromMock,
        selectMock,
        selectEqMock,
        singleMock,
        updateMock,
        updateEqMock
    }
}

describe('channels actions: WhatsApp core flows', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.META_APP_ID = 'meta-app-1'
        process.env.META_APP_SECRET = 'meta-secret-1'
        process.env.META_WEBHOOK_VERIFY_TOKEN = 'global-verify-token'
        process.env.NEXT_PUBLIC_APP_URL = 'https://app.askqualy.com'
        assertTenantWriteAllowedMock.mockResolvedValue(undefined)
        exchangeMetaCodeForTokenMock.mockResolvedValue('short-token-1')
        exchangeMetaForLongLivedTokenMock.mockResolvedValue('long-token-1')
        getPhoneNumberMock.mockResolvedValue({
            display_phone_number: '+90 555 111 22 33',
            verified_name: 'Qualy',
            quality_rating: 'GREEN'
        })
        registerPhoneNumberMock.mockResolvedValue({ success: true })
        deregisterPhoneNumberMock.mockResolvedValue({ success: true })
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
        subscribeAppToBusinessAccountMock.mockResolvedValue({ success: true })
        resolveMetaInstagramConnectionCandidateMock.mockResolvedValue({
            pageId: '17841444965056435',
            pageName: 'itsalinayalin',
            pageAccessToken: 'token-ig-1',
            instagramBusinessAccountId: '17841444965056435',
            instagramUsername: 'itsalinayalin'
        })
        resolveMetaWhatsAppConnectionCandidateMock.mockResolvedValue({
            businessAccountId: 'waba-discovered-1',
            businessAccountName: 'Qualy Business',
            phoneNumberId: 'phone-discovered-1',
            displayPhoneNumber: '+90 555 444 33 22'
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

    it('returns a specific validation error when embedded signup mode is invalid', async () => {
        const { supabase } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await completeWhatsAppEmbeddedSignupChannel('org-1', {
            authCode: 'auth-code-1',
            mode: 'legacy' as never,
            phoneNumberId: 'phone-1',
            businessAccountId: 'waba-1'
        })

        expect(result).toEqual({ error: 'Invalid WhatsApp embedded signup mode.' })
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
        expect(subscribeAppToBusinessAccountMock).toHaveBeenCalledWith('biz-1', {
            overrideCallbackUri: 'https://app.askqualy.com/api/webhooks/whatsapp',
            verifyToken: 'verify-1'
        })
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
                    connected_via: 'manual',
                    display_phone_number: '+90 555 111 22 33',
                    webhook_status: 'pending',
                    webhook_callback_uri: 'https://app.askqualy.com/api/webhooks/whatsapp',
                    webhook_subscription_error: null,
                    webhook_subscription_requested_at: expect.any(String),
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
            mode: 'new',
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
        expect(registerPhoneNumberMock).toHaveBeenCalledTimes(1)
        expect(subscribeAppToBusinessAccountMock).toHaveBeenCalledTimes(1)
        const generatedPin = registerPhoneNumberMock.mock.calls[0]?.[1]
        expect(generatedPin).toMatch(/^\d{6}$/)
        expect(registerPhoneNumberMock).toHaveBeenCalledWith('phone-1', generatedPin)
        expect(subscribeAppToBusinessAccountMock).toHaveBeenCalledWith('waba-1', {
            overrideCallbackUri: 'https://app.askqualy.com/api/webhooks/whatsapp',
            verifyToken: 'global-verify-token'
        })
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
                    embedded_signup_mode: 'new',
                    two_step_verification_pin: generatedPin,
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

    it('falls back to server-side WhatsApp asset discovery when embedded-signup finish ids are missing', async () => {
        const { supabase, upsertMock, rpcMock } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await completeWhatsAppEmbeddedSignupChannel('org-1', {
            authCode: 'auth-code-1',
            mode: 'existing',
            phoneNumberId: '',
            businessAccountId: ''
        })

        expect(result).toEqual({ success: true })
        expect(resolveMetaWhatsAppConnectionCandidateMock).toHaveBeenCalledWith({
            userAccessToken: 'long-token-1',
            appId: 'meta-app-1',
            appSecret: 'meta-secret-1'
        })
        expect(registerPhoneNumberMock).not.toHaveBeenCalled()
        expect(subscribeAppToBusinessAccountMock).toHaveBeenCalledWith('waba-discovered-1', {
            overrideCallbackUri: 'https://app.askqualy.com/api/webhooks/whatsapp',
            verifyToken: 'global-verify-token'
        })
        expect(getPhoneNumberMock).toHaveBeenCalledWith('phone-discovered-1')
        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    embedded_signup_mode: 'existing',
                    business_account_id: 'waba-discovered-1',
                    phone_number_id: 'phone-discovered-1'
                }),
                name: 'WhatsApp (+90 555 111 22 33)',
                status: 'active'
            }),
            { onConflict: 'organization_id,type' }
        )
        expect(rpcMock).toHaveBeenCalledWith('enforce_org_trial_business_policy', {
            target_organization_id: 'org-1',
            input_whatsapp_business_account_id: 'waba-discovered-1',
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
            mode: 'new',
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

    it('uses a generated channel verify token for webhook override when global token is unavailable', async () => {
        delete process.env.META_WEBHOOK_VERIFY_TOKEN

        const { supabase } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        await completeWhatsAppEmbeddedSignupChannel('org-1', {
            authCode: 'auth-code-1',
            mode: 'new',
            phoneNumberId: 'phone-1',
            businessAccountId: 'waba-1'
        })

        const subscribeOverrides = subscribeAppToBusinessAccountMock.mock.calls[0]?.[1]
        expect(subscribeOverrides).toEqual({
            overrideCallbackUri: 'https://app.askqualy.com/api/webhooks/whatsapp',
            verifyToken: expect.any(String)
        })
        expect((subscribeOverrides as { verifyToken?: string } | undefined)?.verifyToken).not.toBe('global-verify-token')
    })

    it('skips phone registration and PIN persistence for existing-number embedded signup', async () => {
        const { supabase, upsertMock, rpcMock } = createUpsertSupabaseMock()
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await completeWhatsAppEmbeddedSignupChannel('org-1', {
            authCode: 'auth-code-1',
            mode: 'existing',
            phoneNumberId: 'phone-1',
            businessAccountId: 'waba-1'
        })

        expect(result).toEqual({ success: true })
        expect(registerPhoneNumberMock).not.toHaveBeenCalled()
        expect(subscribeAppToBusinessAccountMock).toHaveBeenCalledTimes(1)
        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.not.objectContaining({
                    two_step_verification_pin: expect.any(String)
                }),
                status: 'active'
            }),
            { onConflict: 'organization_id,type' }
        )
        expect(upsertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                config: expect.objectContaining({
                    embedded_signup_mode: 'existing'
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

    it('returns normalized debug info for WhatsApp channel', async () => {
        const { supabase, eqMock } = createDebugSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            status: 'active',
            config: {
                permanent_access_token: 'token-1',
                phone_number_id: 'phone-1',
                verify_token: 'verify-1',
                webhook_status: 'pending',
                webhook_verified_at: null
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
                connection_state: 'pending',
                webhook_status: 'pending',
                webhook_callback_uri: null,
                webhook_subscription_requested_at: null,
                webhook_subscription_error: null,
                webhook_verified_at: null,
                display_phone_number: '+90 555 111 22 33',
                verified_name: 'Qualy',
                quality_rating: 'GREEN'
            }
        })
    })

    it('returns normalized debug info for Instagram channel via oauth resolver', async () => {
        const { supabase, eqMock } = createDebugSupabaseMock({
            id: 'channel-ig-1',
            type: 'instagram',
            status: 'active',
            config: {
                page_access_token: 'token-ig-1',
                instagram_business_account_id: '17841444965056435',
                verify_token: 'verify-ig-1',
                page_id: '17841444965056435'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        const result = await debugInstagramChannel('channel-ig-1')

        expect(eqMock).toHaveBeenCalledWith('id', 'channel-ig-1')
        expect(resolveMetaInstagramConnectionCandidateMock).toHaveBeenCalledWith('token-ig-1')
        expect(result).toEqual({
            success: true,
            info: {
                connection_state: 'pending',
                instagram_business_account_id: '17841444965056435',
                page_id: '17841444965056435',
                verify_token_set: true,
                webhook_status: 'pending',
                webhook_subscription_requested_at: null,
                webhook_subscribed_fields: null,
                webhook_verified_at: null,
                webhook_subscription_error: null,
                username: 'itsalinayalin',
                page_name: 'itsalinayalin',
                resolved_instagram_business_account_id: '17841444965056435',
                resolved_page_id: '17841444965056435',
                token_subject_matches_channel: true
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

    it('deletes the local whatsapp channel without deregistering cloud api assets', async () => {
        const { supabase, deleteEqMock } = createDisconnectSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            config: {
                permanent_access_token: 'token-1',
                phone_number_id: 'phone-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        await expect(disconnectChannel('channel-1')).resolves.toEqual({ success: true })

        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(whatsAppCtorMock).not.toHaveBeenCalled()
        expect(deregisterPhoneNumberMock).not.toHaveBeenCalled()
        expect(deleteEqMock).toHaveBeenCalledWith('id', 'channel-1')
        expect(revalidatePathMock).toHaveBeenCalledWith('/settings/channels')
    })

    it('still deletes the local whatsapp channel even when coexistence metadata exists', async () => {
        const { supabase, deleteEqMock } = createDisconnectSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            config: {
                permanent_access_token: 'token-1',
                phone_number_id: 'phone-1'
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        await expect(disconnectChannel('channel-1')).resolves.toEqual({ success: true })
        expect(whatsAppCtorMock).not.toHaveBeenCalled()
        expect(deregisterPhoneNumberMock).not.toHaveBeenCalled()
        expect(deleteEqMock).toHaveBeenCalledWith('id', 'channel-1')
    })

    it('retries whatsapp webhook subscription without disconnecting the channel', async () => {
        const { supabase, updateMock, updateEqMock } = createRetryWebhookSupabaseMock({
            id: 'channel-1',
            type: 'whatsapp',
            status: 'active',
            config: {
                permanent_access_token: 'token-1',
                business_account_id: 'waba-1',
                verify_token: 'verify-1',
                webhook_status: 'pending',
                webhook_verified_at: null
            }
        })
        createClientMock.mockResolvedValueOnce(supabase)

        await expect(retryWhatsAppWebhookVerification('channel-1')).resolves.toEqual({ success: true })

        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(whatsAppCtorMock).toHaveBeenCalledWith('token-1')
        expect(subscribeAppToBusinessAccountMock).toHaveBeenCalledWith('waba-1', {
            overrideCallbackUri: 'https://app.askqualy.com/api/webhooks/whatsapp',
            verifyToken: 'verify-1'
        })
        expect(updateMock).toHaveBeenCalledWith({
            config: expect.objectContaining({
                permanent_access_token: 'token-1',
                business_account_id: 'waba-1',
                verify_token: 'verify-1',
                webhook_status: 'pending',
                webhook_callback_uri: 'https://app.askqualy.com/api/webhooks/whatsapp',
                webhook_subscription_requested_at: expect.any(String),
                webhook_subscription_error: null
            })
        })
        expect(updateEqMock).toHaveBeenCalledWith('id', 'channel-1')
        expect(revalidatePathMock).toHaveBeenCalledWith('/settings/channels')
        expect(deregisterPhoneNumberMock).not.toHaveBeenCalled()
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
