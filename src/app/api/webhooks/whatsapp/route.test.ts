import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createClientMock,
    extractWhatsAppTextMessagesMock,
    isValidMetaSignatureMock,
    processInboundAiPipelineMock,
    sendTextMock,
    whatsAppCtorMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    extractWhatsAppTextMessagesMock: vi.fn(),
    isValidMetaSignatureMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    sendTextMock: vi.fn(),
    whatsAppCtorMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/whatsapp/webhook', () => ({
    extractWhatsAppTextMessages: extractWhatsAppTextMessagesMock,
    isValidMetaSignature: isValidMetaSignatureMock
}))

vi.mock('@/lib/channels/inbound-ai-pipeline', () => ({
    processInboundAiPipeline: processInboundAiPipelineMock
}))

vi.mock('@/lib/whatsapp/client', () => ({
    WhatsAppClient: class {
        constructor(token: string) {
            whatsAppCtorMock(token)
        }

        sendText = sendTextMock
    }
}))

import { GET, POST } from '@/app/api/webhooks/whatsapp/route'

function createChannelLookupSupabaseMock(channelData: unknown) {
    const maybeSingleMock = vi.fn(async () => ({ data: channelData }))
    const eqThird = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const eqSecond = vi.fn(() => ({ eq: eqThird }))
    const eqFirst = vi.fn(() => ({ eq: eqSecond }))
    const selectMock = vi.fn(() => ({ eq: eqFirst }))
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
        maybeSingleMock
    }
}

describe('WhatsApp webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
    })

    afterEach(() => {
        delete process.env.META_WEBHOOK_VERIFY_TOKEN
    })

    it('returns challenge when global verify token matches on GET', async () => {
        process.env.META_WEBHOOK_VERIFY_TOKEN = 'global-token'

        const req = new NextRequest(
            'http://localhost/api/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=global-token&hub.challenge=challenge-ok'
        )

        const res = await GET(req)

        expect(res.status).toBe(200)
        await expect(res.text()).resolves.toBe('challenge-ok')
        expect(createClientMock).not.toHaveBeenCalled()
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
        extractWhatsAppTextMessagesMock.mockReturnValue([event])
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

    it('forwards valid text event into shared inbound pipeline', async () => {
        const event = {
            phoneNumberId: 'phone-1',
            contactPhone: '905551112233',
            contactName: 'Ayse',
            messageId: 'wamid-1',
            text: 'Merhaba',
            timestamp: '1738000000'
        }
        const { supabase, selectMock } = createChannelLookupSupabaseMock({
            id: 'channel-1',
            organization_id: 'org-1',
            config: {
                phone_number_id: 'phone-1',
                app_secret: 'app-secret',
                permanent_access_token: 'token-1'
            }
        })

        createClientMock.mockReturnValue(supabase)
        extractWhatsAppTextMessagesMock.mockReturnValue([event])
        isValidMetaSignatureMock.mockReturnValue(true)
        processInboundAiPipelineMock.mockImplementationOnce(async (input: { sendOutbound: (text: string) => Promise<void> }) => {
            await input.sendOutbound('Bot reply')
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
        expect(selectMock).toHaveBeenCalledWith('id, organization_id, config')
        expect(whatsAppCtorMock).toHaveBeenCalledWith('token-1')
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                platform: 'whatsapp',
                source: 'whatsapp',
                contactId: '905551112233',
                text: 'Merhaba',
                inboundMessageId: 'wamid-1'
            })
        )
        expect(sendTextMock).toHaveBeenCalledWith({
            phoneNumberId: 'phone-1',
            to: '905551112233',
            text: 'Bot reply'
        })
    })
})
