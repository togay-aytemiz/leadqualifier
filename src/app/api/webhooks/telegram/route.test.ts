import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    createClientMock,
    processInboundAiPipelineMock,
    telegramCtorMock,
    telegramGetFileMock,
    telegramGetUserProfilePhotosMock,
    telegramSendImageMock,
    telegramSendMessageMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    telegramCtorMock: vi.fn(),
    telegramGetFileMock: vi.fn(),
    telegramGetUserProfilePhotosMock: vi.fn(),
    telegramSendImageMock: vi.fn(),
    telegramSendMessageMock: vi.fn()
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/channels/inbound-ai-pipeline', () => ({
    processInboundAiPipeline: processInboundAiPipelineMock
}))

vi.mock('@/lib/telegram/client', () => ({
    TelegramClient: class {
        constructor(token: string) {
            telegramCtorMock(token)
        }

        getFile = telegramGetFileMock
        getUserProfilePhotos = telegramGetUserProfilePhotosMock
        sendImage = telegramSendImageMock
        sendMessage = telegramSendMessageMock
    }
}))

import { POST } from '@/app/api/webhooks/telegram/route'

type QueryBuilder = Record<string, unknown>

function createSupabaseMock(plan: Record<string, QueryBuilder[]>) {
    return {
        from: vi.fn((table: string) => {
            const queue = plan[table]
            if (!queue || queue.length === 0) {
                throw new Error(`Unexpected query for table: ${table}`)
            }

            const next = queue.shift()
            if (!next) {
                throw new Error(`No query builder configured for table: ${table}`)
            }

            return next
        })
    }
}

function createChannelLookupBuilder(config: Record<string, unknown> = { webhook_secret: 'secret-1', bot_token: 'token-1' }) {
    const singleMock = vi.fn(async () => ({
        data: {
            id: 'channel-1',
            organization_id: 'org-1',
            config
        }
    }))
    const eqMock = vi.fn(() => ({
        eq: eqMock,
        single: singleMock
    }))
    const selectMock = vi.fn(() => ({ eq: eqMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createConversationAvatarLookupBuilder(avatarUrl: string | null = 'https://api.telegram.org/file/bottoken-1/photos/existing.jpg') {
    const maybeSingleMock = vi.fn(async () => ({
        data: avatarUrl === null ? { contact_avatar_url: null } : { contact_avatar_url: avatarUrl }
    }))
    const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }))
    const eqContactMock = vi.fn(() => ({ limit: limitMock }))
    const eqPlatformMock = vi.fn(() => ({ eq: eqContactMock }))
    const eqOrgMock = vi.fn(() => ({ eq: eqPlatformMock }))
    const selectMock = vi.fn(() => ({ eq: eqOrgMock }))

    return {
        builder: {
            select: selectMock
        }
    }
}

function createTelegramRequest(body: unknown, headers: Record<string, string> = {}) {
    return new NextRequest('http://localhost/api/webhooks/telegram?secret=secret-1', {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...headers
        },
        body: typeof body === 'string' ? body : JSON.stringify(body)
    })
}

function createValidTelegramUpdate(overrides: Record<string, unknown> = {}) {
    return {
        update_id: 1001,
        message: {
            message_id: 12,
            text: 'Merhaba',
            chat: { id: 123 },
            from: { id: 456, first_name: 'Ayse' },
            ...overrides
        }
    }
}

describe('Telegram webhook route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllEnvs()
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co'
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key'
        processInboundAiPipelineMock.mockResolvedValue(undefined)
        telegramGetUserProfilePhotosMock.mockResolvedValue({
            total_count: 0,
            photos: []
        })
        telegramGetFileMock.mockResolvedValue({
            file_id: 'file-1',
            file_path: 'photos/avatar.jpg'
        })
        telegramSendMessageMock.mockResolvedValue({ message_id: 88 })
        telegramSendImageMock.mockResolvedValue({ message_id: 89 })
    })

    it('returns 400 for malformed JSON without creating a service client', async () => {
        const res = await POST(createTelegramRequest('{bad-json', {
            'x-telegram-bot-api-secret-token': 'secret-1'
        }))

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({ error: 'Invalid JSON body' })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('ignores non-message updates without creating a service client', async () => {
        const res = await POST(createTelegramRequest({
            update_id: 1000,
            edited_message: {
                message_id: 11,
                text: 'Düzenlendi',
                chat: { id: 123 },
                from: { id: 456, first_name: 'Ayse' }
            }
        }, {
            'x-telegram-bot-api-secret-token': 'secret-1'
        }))

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('returns 400 for text messages missing required chat or sender data', async () => {
        const res = await POST(createTelegramRequest({
            update_id: 1000,
            message: {
                message_id: 11,
                text: 'Merhaba',
                from: { id: 456, first_name: 'Ayse' }
            }
        }, {
            'x-telegram-bot-api-secret-token': 'secret-1'
        }))

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({ error: 'Invalid Telegram message payload' })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('does not accept query-string webhook secrets in production', async () => {
        vi.stubEnv('NODE_ENV', 'production')

        const res = await POST(createTelegramRequest(createValidTelegramUpdate()))

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toEqual({ error: 'Unauthorized' })
        expect(createClientMock).not.toHaveBeenCalled()
    })

    it('delegates valid text messages to the shared inbound AI pipeline', async () => {
        const channelLookup = createChannelLookupBuilder()
        const conversationAvatarLookup = createConversationAvatarLookupBuilder()
        const supabase = createSupabaseMock({
            channels: [channelLookup.builder],
            conversations: [conversationAvatarLookup.builder]
        })
        createClientMock.mockReturnValue(supabase)

        const res = await POST(createTelegramRequest(createValidTelegramUpdate()))

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({ ok: true })
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            supabase,
            organizationId: 'org-1',
            platform: 'telegram',
            source: 'telegram',
            contactId: '123',
            contactName: 'Ayse',
            contactAvatarUrl: 'https://api.telegram.org/file/bottoken-1/photos/existing.jpg',
            text: 'Merhaba',
            inboundMessageId: '12',
            inboundMessageIdMetadataKey: 'telegram_message_id',
            inboundMessageMetadata: {
                telegram_message_id: '12',
                telegram_contact_avatar_url: 'https://api.telegram.org/file/bottoken-1/photos/existing.jpg'
            },
            skipAutomation: false,
            logPrefix: 'Telegram Webhook'
        }))
    })

    it('hydrates missing telegram avatar urls before delegating to the pipeline', async () => {
        const channelLookup = createChannelLookupBuilder()
        const conversationAvatarLookup = createConversationAvatarLookupBuilder(null)
        const supabase = createSupabaseMock({
            channels: [channelLookup.builder],
            conversations: [conversationAvatarLookup.builder]
        })
        createClientMock.mockReturnValue(supabase)
        telegramGetUserProfilePhotosMock.mockResolvedValueOnce({
            total_count: 1,
            photos: [[{ file_id: 'file-1' }]]
        })

        const res = await POST(createTelegramRequest(createValidTelegramUpdate()))

        expect(res.status).toBe(200)
        expect(telegramGetUserProfilePhotosMock).toHaveBeenCalledWith(456, { limit: 1 })
        expect(telegramGetFileMock).toHaveBeenCalledWith('file-1')
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            contactAvatarUrl: 'https://api.telegram.org/file/bottoken-1/photos/avatar.jpg',
            inboundMessageMetadata: expect.objectContaining({
                telegram_contact_avatar_url: 'https://api.telegram.org/file/bottoken-1/photos/avatar.jpg'
            })
        }))
    })

    it('adapts shared outbound text and image messages to Telegram', async () => {
        const channelLookup = createChannelLookupBuilder()
        const conversationAvatarLookup = createConversationAvatarLookupBuilder()
        const supabase = createSupabaseMock({
            channels: [channelLookup.builder],
            conversations: [conversationAvatarLookup.builder]
        })
        createClientMock.mockReturnValue(supabase)

        await POST(createTelegramRequest(createValidTelegramUpdate()))

        const pipelineInput = processInboundAiPipelineMock.mock.calls[0]?.[0]
        await pipelineInput.sendOutbound('Cevap metni')
        await pipelineInput.sendOutbound({
            type: 'image',
            imageUrl: 'https://cdn.example.com/image.png',
            caption: 'Görsel açıklaması'
        })

        expect(telegramSendMessageMock).toHaveBeenCalledWith('123', 'Cevap metni')
        expect(telegramSendImageMock).toHaveBeenCalledWith(
            '123',
            'https://cdn.example.com/image.png',
            'Görsel açıklaması'
        )
    })

    it('stores inbound messages without automation when the channel has no bot token', async () => {
        const channelLookup = createChannelLookupBuilder({ webhook_secret: 'secret-1' })
        const conversationAvatarLookup = createConversationAvatarLookupBuilder()
        const supabase = createSupabaseMock({
            channels: [channelLookup.builder],
            conversations: [conversationAvatarLookup.builder]
        })
        createClientMock.mockReturnValue(supabase)

        const res = await POST(createTelegramRequest(createValidTelegramUpdate()))

        expect(res.status).toBe(200)
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            skipAutomation: true
        }))
    })
})
