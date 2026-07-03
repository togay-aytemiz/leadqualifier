import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    afterCallbacks,
    afterMock,
    createClientMock,
    downloadMediaMock,
    extractWhatsAppInboundMessagesMock,
    getMediaMetadataMock,
    enqueueInboundMessageJobMock,
    isValidMetaSignatureMock,
    processInboundAiPipelineMock,
    sendReplyButtonsMock,
    sendTextMock,
    storageFromMock,
    storageGetPublicUrlMock,
    storageUploadMock,
    whatsAppCtorMock
} = vi.hoisted(() => ({
    afterCallbacks: [] as Array<() => void | Promise<void>>,
    afterMock: vi.fn((callback: () => void | Promise<void>) => {
        afterCallbacks.push(callback)
    }),
    createClientMock: vi.fn(),
    downloadMediaMock: vi.fn(),
    extractWhatsAppInboundMessagesMock: vi.fn(),
    getMediaMetadataMock: vi.fn(),
    enqueueInboundMessageJobMock: vi.fn(),
    isValidMetaSignatureMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    sendReplyButtonsMock: vi.fn(),
    sendTextMock: vi.fn(),
    storageFromMock: vi.fn(),
    storageGetPublicUrlMock: vi.fn(),
    storageUploadMock: vi.fn(),
    whatsAppCtorMock: vi.fn()
}))

vi.mock('next/server', async () => {
    const actual = await vi.importActual<typeof import('next/server')>('next/server')
    return {
        ...actual,
        after: afterMock
    }
})

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/whatsapp/webhook', () => ({
    extractWhatsAppInboundMessages: extractWhatsAppInboundMessagesMock,
    isValidMetaSignature: isValidMetaSignatureMock
}))

vi.mock('@/lib/channels/inbound-ai-pipeline', () => ({
    processInboundAiPipeline: processInboundAiPipelineMock
}))

vi.mock('@/lib/channels/inbound-job-queue', () => ({
    enqueueInboundMessageJob: enqueueInboundMessageJobMock
}))

vi.mock('@/lib/whatsapp/client', () => ({
    WhatsAppClient: class {
        constructor(token: string) {
            whatsAppCtorMock(token)
        }

        getMediaMetadata = getMediaMetadataMock
        downloadMedia = downloadMediaMock
        sendReplyButtons = sendReplyButtonsMock
        sendText = sendTextMock
    }
}))

import { GET, POST } from '@/app/api/webhooks/whatsapp/route'

async function flushAfterCallbacks() {
    while (afterCallbacks.length > 0) {
        const callback = afterCallbacks.shift()
        if (!callback) continue
        await callback()
    }
}

function createChannelLookupSupabaseMock(channelData: unknown) {
    const maybeSingleMock = vi.fn(async () => ({ data: channelData }))
    const updateEqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({ eq: updateEqMock }))
    const eqThird = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const eqSecond = vi.fn(() => ({ eq: eqThird }))
    const eqFirst = vi.fn(() => ({ eq: eqSecond }))
    const selectMock = vi.fn(() => ({ eq: eqFirst }))
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
            from: fromMock,
            storage: {
                from: storageFromMock
            }
        },
        fromMock,
        selectMock,
        maybeSingleMock,
        updateMock,
        updateEqMock
    }
}

function createGlobalVerifySupabaseMock(channelData: unknown) {
    const maybeSingleMock = vi.fn(async () => ({ data: channelData }))
    const updateEqMock = vi.fn(async () => ({ error: null }))
    const updateMock = vi.fn(() => ({ eq: updateEqMock }))
    const eqThird = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const eqSecond = vi.fn(() => ({ eq: eqThird }))
    const eqFirst = vi.fn(() => ({ eq: eqSecond }))
    const selectMock = vi.fn(() => ({ eq: eqFirst }))
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
        maybeSingleMock,
        updateMock,
        updateEqMock
    }
}

describe('WhatsApp webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        processInboundAiPipelineMock.mockReset()
        enqueueInboundMessageJobMock.mockResolvedValue({ queued: true, duplicate: false })
        afterCallbacks.length = 0
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    afterEach(() => {
        delete process.env.META_WEBHOOK_VERIFY_TOKEN
        delete process.env.META_WHATSAPP_APP_SECRET
        delete process.env.META_APP_SECRET
    })

    it('returns challenge when global verify token matches on GET', async () => {
        process.env.META_WEBHOOK_VERIFY_TOKEN = 'global-token'
        const { supabase, updateMock, updateEqMock } = createGlobalVerifySupabaseMock({
            id: 'channel-1',
            config: {
                verify_token: 'global-token'
            }
        })
        createClientMock.mockReturnValue(supabase)

        const req = new NextRequest(
            'http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=global-token&hub.challenge=challenge-ok'
        )

        const res = await GET(req)

        expect(res.status).toBe(200)
        await expect(res.text()).resolves.toBe('challenge-ok')
        expect(createClientMock).toHaveBeenCalled()
        expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
            config: expect.objectContaining({
                webhook_status: 'verified',
                webhook_verified_at: expect.any(String)
            })
        }))
        expect(updateEqMock).toHaveBeenCalledWith('id', 'channel-1')
    })

    it('rejects POST request with invalid signature', async () => {
        const event = {
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }
        const { supabase } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1'
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([{
            kind: 'text',
            ...event
        }])
        isValidMetaSignatureMock.mockReturnValue(false)

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=invalid'
            },
            body: JSON.stringify({ entry: [] })
        })

        const res = await POST(req)

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('rejects no-event POST request with invalid signature', async () => {
        process.env.META_WHATSAPP_APP_SECRET = 'app-secret'
        extractWhatsAppInboundMessagesMock.mockReturnValue([])
        isValidMetaSignatureMock.mockReturnValue(false)

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=invalid'
            },
            body: JSON.stringify({ entry: [] })
        })

        const res = await POST(req)

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
        expect(createClientMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
        expect(isValidMetaSignatureMock).toHaveBeenCalledWith(
            'sha256=invalid',
            JSON.stringify({ entry: [] }),
            'app-secret'
        )
    })

    it('forwards valid text event into shared inbound pipeline', async () => {
        const event = {
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }
        const { supabase, selectMock, updateMock, updateEqMock } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1',
                webhook_status: 'pending',
                webhook_verified_at: null
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([{
            kind: 'text',
            ...event
        }])
        isValidMetaSignatureMock.mockReturnValue(true)

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [{}] })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(selectMock).toHaveBeenCalledWith('id, organization_id, config')
        expect(updateMock).toHaveBeenCalledWith({
            config: expect.objectContaining({
                phone_number_id: 'phone-1',
                webhook_status: 'verified',
                webhook_subscription_error: null,
                webhook_verified_at: expect.any(String)
            })
        })
        expect(updateEqMock).toHaveBeenCalledWith('id', 'channel-1')
        expect(enqueueInboundMessageJobMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'whatsapp',
                organizationId: 'org-1',
                channelId: 'channel-1',
                providerMessageId: 'wamid-1',
                payload: {
                    event: expect.objectContaining({
                        kind: 'text',
                        text: 'Merhaba'
                    })
                }
            })
        )
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
        expect(whatsAppCtorMock).not.toHaveBeenCalled()
    })

    it('acknowledges valid POST before running the AI pipeline', async () => {
        const event = {
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }
        const { supabase } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1',
                webhook_status: 'verified',
                webhook_verified_at: '2026-05-22T00:00:00.000Z'
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([{
            kind: 'text',
            ...event
        }])
        isValidMetaSignatureMock.mockReturnValue(true)
        processInboundAiPipelineMock.mockImplementationOnce(() => new Promise(() => undefined))

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [{}] })
        })

        const result = await Promise.race([
            POST(req),
            new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 25))
        ])

        expect(result).not.toBe('timeout')
        expect(enqueueInboundMessageJobMock).toHaveBeenCalledWith(
            expect.objectContaining({
                source: 'whatsapp',
                providerMessageId: 'wamid-1'
            })
        )
        expect(afterMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('forwards interactive button-reply event with parsed skill action selection', async () => {
        const event = {
            kind: 'interactive' as const,
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-interactive-1',
            buttonReplyId: 'skill_action:skill-source-1:action-1',
            buttonReplyTitle: 'Randevu Al',
            timestamp: '1738000002'
        }
        const { supabase } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1'
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([event])
        isValidMetaSignatureMock.mockReturnValue(true)
        processInboundAiPipelineMock.mockResolvedValueOnce(undefined)

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [{}] })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(enqueueInboundMessageJobMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                source: 'whatsapp',
                channelId: 'channel-1',
                providerMessageId: 'wamid-interactive-1',
                payload: { event }
            })
        )
    })

    it('uses interactive reply-button send when pipeline emits reply buttons', async () => {
        const event = {
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }
        const { supabase } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1'
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([{
            kind: 'text',
            ...event
        }])
        isValidMetaSignatureMock.mockReturnValue(true)
        processInboundAiPipelineMock.mockImplementationOnce(async (input: { sendOutbound: (payload: { content: string; replyButtons?: Array<{ id: string; title: string }> }) => Promise<void> }) => {
            await input.sendOutbound({
                content: 'Bot reply',
                replyButtons: [
                    { id: 'skill_action:skill-1:action-1', title: 'Randevu Al' },
                    { id: 'skill_action:skill-1:action-2', title: 'Instagram' }
                ]
            })
        })

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [{}] })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(enqueueInboundMessageJobMock).toHaveBeenCalledWith(expect.objectContaining({
            providerMessageId: 'wamid-1'
        }))
        expect(sendReplyButtonsMock).not.toHaveBeenCalled()
        expect(sendTextMock).not.toHaveBeenCalled()
    })

    it('falls back to plain text send when interactive reply-button send fails', async () => {
        const event = {
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }
        const { supabase } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1'
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([{
            kind: 'text',
            ...event
        }])
        isValidMetaSignatureMock.mockReturnValue(true)
        sendReplyButtonsMock.mockRejectedValueOnce(new Error('interactive failed'))
        processInboundAiPipelineMock.mockImplementationOnce(async (input: { sendOutbound: (payload: { content: string; replyButtons?: Array<{ id: string; title: string }> }) => Promise<void> }) => {
            await input.sendOutbound({
                content: 'Bot reply',
                replyButtons: [
                    { id: 'skill_action:skill-1:action-1', title: 'Randevu Al' }
                ]
            })
        })

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [{}] })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(enqueueInboundMessageJobMock).toHaveBeenCalledWith(expect.objectContaining({
            providerMessageId: 'wamid-1'
        }))
        expect(sendReplyButtonsMock).not.toHaveBeenCalled()
        expect(sendTextMock).not.toHaveBeenCalled()
    })

    it('stores inbound image media and persists placeholder message without auto-reply when caption is missing', async () => {
        const event = {
            kind: 'media' as const,
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-media-1',
            mediaType: 'image' as const,
            mediaId: 'media-1',
            mimeType: 'image/jpeg',
            sha256: 'sha-1',
            caption: null,
            filename: null,
            timestamp: '1738000001'
        }
        const { supabase } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1'
            }
        })

        storageUploadMock.mockResolvedValue({ error: null })
        storageGetPublicUrlMock.mockReturnValue({
            data: {
                publicUrl: 'https://cdn.example.com/whatsapp-media/image-1.jpg'
            }
        })
        storageFromMock.mockReturnValue({
            upload: storageUploadMock,
            getPublicUrl: storageGetPublicUrlMock
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppInboundMessagesMock.mockReturnValue([event])
        isValidMetaSignatureMock.mockReturnValue(true)
        getMediaMetadataMock.mockResolvedValue({
            id: 'media-1',
            url: 'https://graph.example.com/media-1',
            mime_type: 'image/jpeg',
            sha256: 'sha-1'
        })
        downloadMediaMock.mockResolvedValue({
            data: new Uint8Array([1, 2, 3]).buffer,
            contentType: 'image/jpeg'
        })

        const req = new NextRequest('http://localhost/api/webhooks/whatsapp', {
            method: 'POST',
            headers: {
                'content-type': 'application/json',
                'x-hub-signature-256': 'sha256=valid'
            },
            body: JSON.stringify({ entry: [{}] })
        })

        const res = await POST(req)

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(enqueueInboundMessageJobMock).toHaveBeenCalledWith(expect.objectContaining({
            providerMessageId: 'wamid-media-1',
            payload: { event }
        }))
        expect(getMediaMetadataMock).not.toHaveBeenCalled()
        expect(downloadMediaMock).not.toHaveBeenCalled()
        expect(storageUploadMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
        expect(sendTextMock).not.toHaveBeenCalled()
    })
})
