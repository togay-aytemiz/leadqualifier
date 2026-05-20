import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const {
    buildDemoChatContactIdMock,
    createClientMock,
    processInboundAiPipelineMock,
    resolveDemoChatChannelMock,
} = vi.hoisted(() => ({
    buildDemoChatContactIdMock: vi.fn(),
    createClientMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    resolveDemoChatChannelMock: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({
    createClient: createClientMock,
}))

vi.mock('@/lib/demo-chat/channel', () => ({
    buildDemoChatContactId: buildDemoChatContactIdMock,
    resolveDemoChatChannel: resolveDemoChatChannelMock,
}))

vi.mock('@/lib/channels/inbound-ai-pipeline', () => ({
    processInboundAiPipeline: processInboundAiPipelineMock,
}))

import { POST } from '@/app/api/demo/[slug]/chat/route'

function createRequest(body: unknown) {
    return new NextRequest('https://app.askqualy.com/api/demo/yiu-aday-asistani/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
}

function createContext(slug = 'yiu-aday-asistani') {
    return { params: Promise.resolve({ slug }) }
}

describe('demo chat API route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllEnvs()
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
        createClientMock.mockReturnValue({ from: vi.fn() })
        resolveDemoChatChannelMock.mockResolvedValue({
            id: 'demo-channel-1',
            organizationId: 'org-1',
            slug: 'yiu-aday-asistani',
            displayName: 'YIU Aday Asistanı',
            logoUrl: null,
        })
        buildDemoChatContactIdMock.mockImplementation((channelId: string, sessionId: string) => (
            `demo:${channelId}:${sessionId}`
        ))
        processInboundAiPipelineMock.mockImplementation(async (input) => {
            await input.sendOutbound('Merhaba, nasıl yardımcı olabilirim?')
        })
    })

    it('returns 404 for disabled or missing demo slugs before running AI', async () => {
        resolveDemoChatChannelMock.mockResolvedValueOnce(null)

        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'Merhaba',
        }), createContext('missing-demo'))

        expect(res.status).toBe(404)
        await expect(res.json()).resolves.toEqual({ error: 'Demo not found' })
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('persists a session as a demo_chat conversation and returns the AI reply', async () => {
        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'Merhaba',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            response: 'Merhaba, nasıl yardımcı olabilirim?',
            skillImage: null,
        })
        expect(buildDemoChatContactIdMock).toHaveBeenCalledWith('demo-channel-1', 'session-1')
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            platform: 'demo_chat',
            source: 'demo_chat',
            contactId: 'demo:demo-channel-1:session-1',
            contactName: 'Demo ziyaretçi',
            text: 'Merhaba',
            inboundMessageIdMetadataKey: 'demo_chat_message_id',
            logPrefix: 'Demo Chat',
        }))
    })

    it('keeps parallel testers isolated by forwarding distinct session contact ids', async () => {
        await POST(createRequest({
            sessionId: 'session-a',
            message: 'Birinci soru',
        }), createContext())
        await POST(createRequest({
            sessionId: 'session-b',
            message: 'İkinci soru',
        }), createContext())

        expect(processInboundAiPipelineMock).toHaveBeenNthCalledWith(1, expect.objectContaining({
            contactId: 'demo:demo-channel-1:session-a',
            text: 'Birinci soru',
        }))
        expect(processInboundAiPipelineMock).toHaveBeenNthCalledWith(2, expect.objectContaining({
            contactId: 'demo:demo-channel-1:session-b',
            text: 'İkinci soru',
        }))
    })
})
