import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'
import {
    DEMO_MAINTENANCE_BYPASS_COOKIE,
    createDemoMaintenanceBypassCookieValue,
} from '@/lib/demo-chat/maintenance'

const {
    appendCanonicalRagSourceLinksMock,
    buildDemoChatContactIdMock,
    buildRagContextMock,
    createClientMock,
    generateGroundedRagAnswerMock,
    getOrgAiSettingsMock,
    polishGroundedRagAnswerMock,
    processInboundAiPipelineMock,
    recordAiUsageMock,
    repairLinkOnlyRagAnswerMock,
    resolveDemoChatChannelMock,
    matchExactSkillTriggersMock,
    searchKnowledgeBaseFocusedEvidenceMock,
    searchKnowledgeBaseMock,
} = vi.hoisted(() => ({
    appendCanonicalRagSourceLinksMock: vi.fn(),
    buildDemoChatContactIdMock: vi.fn(),
    buildRagContextMock: vi.fn(),
    createClientMock: vi.fn(),
    generateGroundedRagAnswerMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    polishGroundedRagAnswerMock: vi.fn(),
    processInboundAiPipelineMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    repairLinkOnlyRagAnswerMock: vi.fn(),
    resolveDemoChatChannelMock: vi.fn(),
    matchExactSkillTriggersMock: vi.fn(),
    searchKnowledgeBaseFocusedEvidenceMock: vi.fn(),
    searchKnowledgeBaseMock: vi.fn(),
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

vi.mock('@/lib/skills/actions', () => ({
    matchExactSkillTriggers: matchExactSkillTriggersMock,
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock,
}))

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: recordAiUsageMock,
}))

vi.mock('@/lib/knowledge-base/actions', () => ({
    searchKnowledgeBaseFocusedEvidence: searchKnowledgeBaseFocusedEvidenceMock,
    searchKnowledgeBase: searchKnowledgeBaseMock,
}))

vi.mock('@/lib/knowledge-base/rag', () => ({
    buildRagContext: buildRagContextMock,
}))

vi.mock('@/lib/knowledge-base/rag-answer-repair', () => ({
    repairLinkOnlyRagAnswer: repairLinkOnlyRagAnswerMock,
}))

vi.mock('@/lib/knowledge-base/rag-source-links', () => ({
    appendCanonicalRagSourceLinks: appendCanonicalRagSourceLinksMock,
}))

vi.mock('@/lib/knowledge-base/rag-answer-polish', () => ({
    polishGroundedRagAnswer: polishGroundedRagAnswerMock,
}))

vi.mock('@/lib/knowledge-base/rag-answer-generate', () => ({
    generateGroundedRagAnswer: generateGroundedRagAnswerMock,
}))

import { GET, POST } from '@/app/api/demo/[slug]/chat/route'

const demoChannel = {
    id: 'demo-channel-1',
    organizationId: 'org-1',
    slug: 'yiu-aday-asistani',
    displayName: 'YIU Aday Asistanı',
    logoUrl: null,
    maintenanceEnabled: false,
    sharedSecretHash: 'sha256:demo-secret-hash',
}

function createAccessToken(channel = demoChannel) {
    const token = createDemoChatAccessToken({ channel })
    if (!token) throw new Error('Expected demo access token')
    return token
}

function createRequest(body: unknown, options: { token?: string | null; ip?: string; cookies?: Record<string, string> } = {}) {
    const token = options.token === undefined ? createAccessToken() : options.token
    const headers = new Headers({ 'content-type': 'application/json' })
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (options.ip) headers.set('x-forwarded-for', options.ip)
    if (options.cookies) {
        headers.set(
            'cookie',
            Object.entries(options.cookies)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join('; ')
        )
    }

    return new NextRequest('https://app.askqualy.com/api/demo/yiu-aday-asistani/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
}

function createGetRequest(
    searchParams: Record<string, string>,
    options: { token?: string | null; cookies?: Record<string, string> } = {}
) {
    const url = new URL('https://app.askqualy.com/api/demo/yiu-aday-asistani/chat')
    for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value)
    }

    const token = options.token === undefined ? createAccessToken() : options.token
    const headers = new Headers()
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (options.cookies) {
        headers.set(
            'cookie',
            Object.entries(options.cookies)
                .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
                .join('; ')
        )
    }

    return new NextRequest(url, { headers })
}

function createContext(slug = 'yiu-aday-asistani') {
    return { params: Promise.resolve({ slug }) }
}

function createConversationLookupChain(id: string | null) {
    const chain = {
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
            data: id ? { id } : null,
            error: null,
        })),
    }
    chain.eq.mockReturnValue(chain)
    return chain
}

function createDemoTextPersistenceMock(conversationIds: Array<string | null> = ['conversation-1']) {
    const conversations = conversationIds.map((id) => createConversationLookupChain(id))
    const duplicateReplyChain = {
        eq: vi.fn(),
        maybeSingle: vi.fn(async () => ({
            data: null,
            error: null,
        })),
    }
    duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)

    const botInsertChain = {
        insert: vi.fn(async () => ({ error: null })),
    }
    const conversationUpdateChain = {
        update: vi.fn(() => conversationUpdateChain),
        eq: vi.fn(async () => ({ error: null })),
    }
    const fromMock = vi.fn((table: string) => {
        if (table === 'conversations') {
            const chain = conversations.shift()
            if (!chain) return { update: conversationUpdateChain.update }
            return {
                select: vi.fn(() => chain),
                update: conversationUpdateChain.update,
            }
        }
        if (table === 'messages') {
            return {
                select: vi.fn(() => duplicateReplyChain),
                insert: botInsertChain.insert,
            }
        }
        throw new Error(`Unexpected table ${table}`)
    })

    return {
        botInsertChain,
        duplicateReplyChain,
        conversationUpdateChain,
        fromMock,
    }
}

describe('demo chat API route', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllEnvs()
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role-key')
        createClientMock.mockReturnValue({ from: vi.fn() })
        resolveDemoChatChannelMock.mockResolvedValue(demoChannel)
        buildDemoChatContactIdMock.mockImplementation((channelId: string, sessionId: string) => (
            `demo:${channelId}:${sessionId}`
        ))
        processInboundAiPipelineMock.mockImplementation(async (input) => {
            await input.sendOutbound('Merhaba, nasıl yardımcı olabilirim?')
        })
        getOrgAiSettingsMock.mockResolvedValue({
            prompt: 'Samimi cevap ver.',
            bot_name: 'Qualy',
        })
        generateGroundedRagAnswerMock.mockResolvedValue({
            answer: '',
            usedGeneration: false,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
        })
        polishGroundedRagAnswerMock.mockImplementation(async ({ answer }) => ({
            answer,
            usedPolish: false,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
        }))
        recordAiUsageMock.mockResolvedValue(undefined)
        searchKnowledgeBaseMock.mockResolvedValue([])
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValue([])
        matchExactSkillTriggersMock.mockResolvedValue([])
        buildRagContextMock.mockReturnValue({ context: '', chunks: [], tokenCount: 0 })
        repairLinkOnlyRagAnswerMock.mockReturnValue(null)
        appendCanonicalRagSourceLinksMock.mockImplementation((response: string) => response)
    })

    afterEach(() => {
        vi.useRealTimers()
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

    it('returns maintenance for demo chat posts before Supabase or AI work when the flag is enabled', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_MODE', '1')

        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'Merhaba',
        }), createContext())

        expect(res.status).toBe(503)
        expect(res.headers.get('retry-after')).toBe('900')
        await expect(res.json()).resolves.toEqual({ error: 'Demo is under maintenance' })
        expect(createClientMock).not.toHaveBeenCalled()
        expect(resolveDemoChatChannelMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('returns maintenance for demo chat polling before Supabase or AI recovery when the flag is enabled', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_MODE', '1')

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Merhaba',
        }), createContext())

        expect(res.status).toBe(503)
        expect(res.headers.get('retry-after')).toBe('900')
        await expect(res.json()).resolves.toEqual({ error: 'Demo is under maintenance' })
        expect(createClientMock).not.toHaveBeenCalled()
        expect(resolveDemoChatChannelMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('returns maintenance for demo chat posts when the resolved demo channel is in maintenance', async () => {
        resolveDemoChatChannelMock.mockResolvedValueOnce({
            ...demoChannel,
            maintenanceEnabled: true,
        })

        const res = await POST(createRequest({
            sessionId: 'db-maintenance-post-session',
            message: 'Merhaba',
        }, {
            ip: '203.0.113.78',
        }), createContext())

        expect(res.status).toBe(503)
        expect(res.headers.get('retry-after')).toBe('900')
        await expect(res.json()).resolves.toEqual({ error: 'Demo is under maintenance' })
        expect(createClientMock).toHaveBeenCalled()
        expect(resolveDemoChatChannelMock).toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('returns maintenance for demo chat polling when the resolved demo channel is in maintenance', async () => {
        resolveDemoChatChannelMock.mockResolvedValueOnce({
            ...demoChannel,
            maintenanceEnabled: true,
        })

        const res = await GET(createGetRequest({
            sessionId: 'db-maintenance-get-session',
            messageId: 'db-maintenance-message',
            message: 'Merhaba',
        }), createContext())

        expect(res.status).toBe(503)
        expect(res.headers.get('retry-after')).toBe('900')
        await expect(res.json()).resolves.toEqual({ error: 'Demo is under maintenance' })
        expect(createClientMock).toHaveBeenCalled()
        expect(resolveDemoChatChannelMock).toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('allows demo chat posts through maintenance mode when the admin bypass cookie is valid', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_MODE', '1')
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')
        const bypassCookieValue = createDemoMaintenanceBypassCookieValue(
            'qualy-admin-maintenance-bypass-token-123'
        )

        const res = await POST(createRequest({
            sessionId: 'maintenance-bypass-post-session',
            message: 'Merhaba',
        }, {
            ip: '203.0.113.77',
            cookies: {
                [DEMO_MAINTENANCE_BYPASS_COOKIE]: bypassCookieValue,
            },
        }), createContext())

        expect(res.status).not.toBe(503)
        expect(createClientMock).toHaveBeenCalled()
        expect(resolveDemoChatChannelMock).toHaveBeenCalled()
    })

    it('allows demo chat polling through maintenance mode when the admin bypass cookie is valid', async () => {
        vi.stubEnv('DEMO_MAINTENANCE_MODE', '1')
        vi.stubEnv('DEMO_MAINTENANCE_BYPASS_TOKEN', 'qualy-admin-maintenance-bypass-token-123')
        const bypassCookieValue = createDemoMaintenanceBypassCookieValue(
            'qualy-admin-maintenance-bypass-token-123'
        )

        const res = await GET(createGetRequest({
            sessionId: 'maintenance-bypass-get-session',
            messageId: 'maintenance-bypass-message',
            message: 'Merhaba',
        }, {
            cookies: {
                [DEMO_MAINTENANCE_BYPASS_COOKIE]: bypassCookieValue,
            },
        }), createContext())

        expect(res.status).not.toBe(503)
        expect(createClientMock).toHaveBeenCalled()
        expect(resolveDemoChatChannelMock).toHaveBeenCalled()
    })

    it('rejects demo chat posts without a signed access token before running AI', async () => {
        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'Merhaba',
        }, { token: null }), createContext())

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toEqual({ error: 'Demo access denied' })
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('rejects demo chat polling without a signed access token before recovery', async () => {
        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
        }, { token: null }), createContext())

        expect(res.status).toBe(401)
        await expect(res.json()).resolves.toEqual({ error: 'Demo access denied' })
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('rejects overlong demo messages instead of silently truncating them', async () => {
        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'a'.repeat(2001),
        }), createContext())

        expect(res.status).toBe(400)
        await expect(res.json()).resolves.toEqual({ error: 'Message is too long' })
        expect(resolveDemoChatChannelMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('returns a pending message id immediately so polling can recover the AI reply', async () => {
        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'personelin ücretsiz izin süresi ne kadar',
        }), createContext())

        expect(res.status).toBe(202)
        const body = await res.json()
        expect(body).toMatchObject({ pending: true })
        expect(typeof body.messageId).toBe('string')
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'personelin ücretsiz izin süresi ne kadar',
            inboundMessageId: body.messageId,
            skipAutomation: true,
        }))
    })

    it('answers exact skill matches during POST before pending or RAG recovery starts', async () => {
        matchExactSkillTriggersMock.mockResolvedValueOnce([{
            skill_id: 'skill-greeting',
            title: 'Karşılama ve İlk Mesaj',
            response_text: 'Merhaba, nasıl yardımcı olabilirim?',
            trigger_text: 'Merhaba',
            similarity: 1,
        }])

        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'Merhaba',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Merhaba, nasıl yardımcı olabilirim?',
            skillImage: null,
        })
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'Merhaba',
            inboundMessageId: expect.any(String),
            platform: 'demo_chat',
            source: 'demo_chat',
        }))
        expect(searchKnowledgeBaseFocusedEvidenceMock).not.toHaveBeenCalled()
        expect(searchKnowledgeBaseMock).not.toHaveBeenCalled()
    })

    it('returns a pending response before a slow AI pipeline can hit the platform timeout', async () => {
        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'personelin ücretsiz izin süresi ne kadar',
        }), createContext())

        expect(res.status).toBe(202)
        const body = await res.json()
        expect(body).toMatchObject({ pending: true })
        expect(typeof body.messageId).toBe('string')
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'personelin ücretsiz izin süresi ne kadar',
            inboundMessageId: body.messageId,
            skipAutomation: true,
        }))
    })

    it('answers demo scope-help questions immediately instead of entering the pending recovery loop', async () => {
        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                return {
                    select: vi.fn(() => conversationChain),
                    update: conversationUpdateChain.update,
                }
            }
            if (table === 'messages') {
                return {
                    select: vi.fn(() => duplicateReplyChain),
                    insert: botInsertChain.insert,
                }
            }
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'sana başka hangi konularda soru sorabilirim',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: expect.stringContaining('aday öğrenci'),
            skillImage: null,
        })
        expect(searchKnowledgeBaseFocusedEvidenceMock).not.toHaveBeenCalled()
        expect(searchKnowledgeBaseMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'sana başka hangi konularda soru sorabilirim',
            inboundMessageId: expect.any(String),
            skipAutomation: true,
        }))
        const inboundMessageId = processInboundAiPipelineMock.mock.calls[0]?.[0]?.inboundMessageId
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            conversation_id: 'conversation-1',
            organization_id: 'org-1',
            sender_type: 'bot',
            content: expect.stringContaining('aday öğrenci'),
            metadata: expect.objectContaining({
                demo_chat_reply_kind: 'text',
                demo_chat_reply_source: 'scope_help',
                demo_chat_reply_to_message_id: inboundMessageId,
            }),
        }))
    })

    it('keeps Turkish scope-help replies Turkish even when the message has no Turkish-specific letters', async () => {
        const { botInsertChain, fromMock } = createDemoTextPersistenceMock()
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await POST(createRequest({
            sessionId: 'session-1',
            message: 'sana hangi konuda soru sorabilirim',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: expect.stringContaining('Bu demo asistana'),
            skillImage: null,
        })
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'sana hangi konuda soru sorabilirim',
            skipAutomation: true,
        }))
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            content: expect.stringContaining('Bu demo asistana'),
            metadata: expect.objectContaining({
                demo_chat_reply_kind: 'text',
                demo_chat_reply_source: 'scope_help',
            }),
        }))
    })

    it('recovers already-pending demo scope-help polls without running RAG or the shared pipeline', async () => {
        const { botInsertChain, fromMock } = createDemoTextPersistenceMock([null, 'conversation-1'])
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'sana başka hangi konularda soru sorabilirim',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: expect.stringContaining('aday öğrenci'),
            skillImage: null,
        })
        expect(searchKnowledgeBaseFocusedEvidenceMock).not.toHaveBeenCalled()
        expect(searchKnowledgeBaseMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'sana başka hangi konularda soru sorabilirim',
            inboundMessageId: 'message-1',
            skipAutomation: true,
        }))
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            conversation_id: 'conversation-1',
            content: expect.stringContaining('aday öğrenci'),
            metadata: expect.objectContaining({
                demo_chat_reply_kind: 'text',
                demo_chat_reply_source: 'scope_help',
                demo_chat_reply_to_message_id: 'message-1',
            }),
        }))
    })

    it('returns a completed pending reply from persisted demo bot messages', async () => {
        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const messagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [
                    {
                        content: 'Ücretsiz izin süresi en fazla 1 yıldır.',
                        metadata: {
                            demo_chat_reply_to_message_id: 'message-1',
                        },
                    },
                ],
                error: null,
            })),
        }
        messagesChain.eq.mockReturnValue(messagesChain)

        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                return { select: vi.fn(() => conversationChain) }
            }
            if (table === 'messages') {
                return { select: vi.fn(() => messagesChain) }
            }
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Ücretsiz izin süresi en fazla 1 yıldır.',
            skillImage: null,
        })
        expect(buildDemoChatContactIdMock).toHaveBeenCalledWith('demo-channel-1', 'session-1')
        expect(messagesChain.eq).toHaveBeenCalledWith('metadata->>demo_chat_reply_to_message_id', 'message-1')
    })

    it('recovers a pending reply during polling when deferred processing did not persist a bot response', async () => {
        const createConversationChain = () => {
            const chain = {
                eq: vi.fn(),
                maybeSingle: vi.fn(async () => ({
                    data: { id: 'conversation-1' },
                    error: null,
                })),
            }
            chain.eq.mockReturnValue(chain)
            return chain
        }

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'personelin ücretsiz izin süresi ne kadar',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const conversations = [createConversationChain(), createConversationChain(), createConversationChain()]
        const messagesTable = {
            select: vi.fn((columns: string) => (
                columns.includes('metadata') ? completedMessagesChain : inboundMessagesChain
            )),
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) throw new Error('Unexpected conversation lookup')
                return { select: vi.fn(() => chain) }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async (input) => {
            await input.sendOutbound('Ücretsiz izin süresi en fazla 1 yıldır.')
        })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Ücretsiz izin süresi en fazla 1 yıldır.',
            skillImage: null,
        })
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'personelin ücretsiz izin süresi ne kadar',
            inboundMessageId: 'message-1',
            reprocessExistingInbound: true,
        }))
        expect(inboundMessagesChain.eq).toHaveBeenCalledWith('metadata->>demo_chat_message_id', 'message-1')
    })

    it('does not start another token-consuming recovery while pending poll recovery is already running', async () => {
        vi.stubEnv('DEMO_CHAT_SYNC_REPLY_TIMEOUT_MS', '1000')

        const chunk = {
            content: 'Yüksek İhtisas Üniversitesinde 7 fakülte, 2 meslek yüksekokulu ve 1 enstitü bulunur.',
            document_id: 'doc-program-count',
            document_title: 'Akademik Birimler',
            source_url: 'https://example.edu.tr/akademik-birimler',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValue([])
        searchKnowledgeBaseMock.mockResolvedValue([chunk])
        buildRagContextMock.mockReturnValue({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 14,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValue(null)
        appendCanonicalRagSourceLinksMock.mockReturnValue(
            'Yüksek İhtisas Üniversitesinde 7 fakülte, 2 meslek yüksekokulu ve 1 enstitü bulunur.\nhttps://example.edu.tr/akademik-birimler'
        )

        let resolveGeneration!: (value: Awaited<ReturnType<typeof generateGroundedRagAnswerMock>>) => void
        const generationPromise = new Promise<Awaited<ReturnType<typeof generateGroundedRagAnswerMock>>>((resolve) => {
            resolveGeneration = resolve
        })
        generateGroundedRagAnswerMock.mockReturnValue(generationPromise)

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'yüksek ihtisas üniversitesinde kaç bölüm var',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns === 'id, content') return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                return { select: vi.fn(() => conversationChain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValue({ from: fromMock })

        const firstResponse = await GET(createGetRequest({
            sessionId: 'session-dedupe',
            messageId: 'message-1',
            message: 'yüksek ihtisas üniversitesinde kaç bölüm var',
        }), createContext())
        expect(firstResponse.status).toBe(202)
        await expect(firstResponse.json()).resolves.toEqual({ pending: true })

        const secondResponse = await GET(createGetRequest({
            sessionId: 'session-dedupe',
            messageId: 'message-1',
            message: 'yüksek ihtisas üniversitesinde kaç bölüm var',
        }), createContext())
        expect(secondResponse.status).toBe(202)
        await expect(secondResponse.json()).resolves.toEqual({ pending: true })

        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledTimes(1)
        expect(searchKnowledgeBaseMock).toHaveBeenCalledTimes(1)
        expect(generateGroundedRagAnswerMock).toHaveBeenCalledTimes(1)

        resolveGeneration({
            answer: 'Yüksek İhtisas Üniversitesinde 7 fakülte, 2 meslek yüksekokulu ve 1 enstitü bulunur.',
            usedGeneration: true,
            addedEngagement: true,
            usage: null,
            model: 'gpt-4o-mini',
        })
    })

    it('recovers from focused evidence before the shared pipeline during polling', async () => {
        const chunk = {
            content: 'SAĞLIK HİZMETLERİ MESLEK YÜKSEKOKULU\nBAĞLUM YERLEŞKESİ: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören',
            document_id: 'doc-shmyo',
            document_title: 'Yerleşke Konumları',
            source_url: 'https://example.edu.tr/yerleske',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 18,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Sağlık Hizmetleri Meslek Yüksekokulu adresi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Sağlık Hizmetleri Meslek Yüksekokulu adresi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.\nhttps://example.edu.tr/yerleske'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'SHMYO kampüsü nerede?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'SHMYO kampüsü nerede?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Sağlık Hizmetleri Meslek Yüksekokulu adresi: Karakaya Mahallesi Bağlum Bulvarı No:1 06291 Keçiören.\nhttps://example.edu.tr/yerleske',
            skillImage: null,
        })
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'SHMYO kampüsü nerede?',
            'org-1',
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseMock).not.toHaveBeenCalled()
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('passes recent demo history into fast RAG retrieval for ambiguous follow-up questions', async () => {
        const chunk = {
            content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        searchKnowledgeBaseMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 12,
        })
        generateGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            usedGeneration: true,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
        })
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Bu programda staj kaç iş günü?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const historyMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(async () => ({
                data: [
                    {
                        content: 'Bu programda staj kaç iş günü?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'message-1' },
                    },
                    {
                        content: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı bulunmaktadır. Yaz stajı 20 iş günüdür.',
                        sender_type: 'bot',
                        metadata: { demo_chat_reply_to_message_id: 'previous-message' },
                    },
                    {
                        content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'previous-message' },
                    },
                ],
                error: null,
            })),
        }
        historyMessagesChain.eq.mockReturnValue(historyMessagesChain)
        historyMessagesChain.order.mockReturnValue(historyMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns === 'id, content') return inboundMessagesChain
                if (columns === 'content, sender_type, metadata') return historyMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Bu programda staj kaç iş günü?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf',
            skillImage: null,
        })
        const expectedHistory = [
            {
                role: 'user',
                content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            },
            {
                role: 'assistant',
                content: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı bulunmaktadır. Yaz stajı 20 iş günüdür.',
            },
        ]
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı? Bu programda staj kaç iş günü?',
            'org-1',
            0.5,
            6,
            expect.objectContaining({
                supabase: expect.any(Object),
                plannerHistory: expectedHistory,
            })
        )
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı? Bu programda staj kaç iş günü?',
            'org-1',
            6,
            expect.objectContaining({
                supabase: expect.any(Object),
                plannerHistory: expectedHistory,
                skipQueryPlanner: true,
            })
        )
        expect(generateGroundedRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            userMessage: 'Bu programda staj kaç iş günü?',
            conversationHistory: expectedHistory,
        }))
    })

    it('tries contextual focused evidence before broad search for ambiguous follow-up questions', async () => {
        const chunk = {
            content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 12,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Bu programda staj kaç iş günü?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const historyMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(async () => ({
                data: [
                    {
                        content: 'Bu programda staj kaç iş günü?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'message-1' },
                    },
                    {
                        content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'previous-message' },
                    },
                ],
                error: null,
            })),
        }
        historyMessagesChain.eq.mockReturnValue(historyMessagesChain)
        historyMessagesChain.order.mockReturnValue(historyMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns === 'id, content') return inboundMessagesChain
                if (columns === 'content, sender_type, metadata') return historyMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Bu programda staj kaç iş günü?',
        }), createContext())

        expect(res.status).toBe(200)
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı? Bu programda staj kaç iş günü?',
            'org-1',
            6,
            expect.objectContaining({
                supabase: expect.any(Object),
                plannerHistory: expect.any(Array),
                skipQueryPlanner: true,
            })
        )
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledTimes(1)
        expect(repairLinkOnlyRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı? Bu programda staj kaç iş günü?',
            allowCompoundRepair: false,
        }))
        expect(searchKnowledgeBaseMock).not.toHaveBeenCalled()
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                rag_diagnostics: expect.objectContaining({
                    search_strategy: 'contextual_focused',
                    deterministic_fast_path: true,
                    retrieved_chunk_count: 1,
                    timings_ms: expect.objectContaining({
                        search: expect.any(Number),
                        total: expect.any(Number),
                    }),
                }),
            })
        }))
    })

    it('does not answer contextual follow-ups from chunks that miss the prior explicit topic anchor', async () => {
        const erasmusChunk = {
            content: 'Erasmus staj hareketliliği 2 ile 12 ay arasında yapılabilir.',
            document_id: 'doc-erasmus',
            document_title: 'Erasmus Staj Hareketliliği',
            source_url: 'https://example.edu.tr/erasmus.pdf',
        }
        searchKnowledgeBaseMock.mockResolvedValueOnce([erasmusChunk])

        const createConversationChain = () => {
            const chain = {
                eq: vi.fn(),
                maybeSingle: vi.fn(async () => ({
                    data: { id: 'conversation-1' },
                    error: null,
                })),
            }
            chain.eq.mockReturnValue(chain)
            return chain
        }

        const emptyCompletedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        emptyCompletedMessagesChain.eq.mockReturnValue(emptyCompletedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Bu programda staj kaç iş günü?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const historyMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(async () => ({
                data: [
                    {
                        content: 'Bu programda staj kaç iş günü?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'message-1' },
                    },
                    {
                        content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'previous-message' },
                    },
                ],
                error: null,
            })),
        }
        historyMessagesChain.eq.mockReturnValue(historyMessagesChain)
        historyMessagesChain.order.mockReturnValue(historyMessagesChain)

        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns === 'id, content') return inboundMessagesChain
                if (columns === 'content, sender_type, metadata') return historyMessagesChain
                if (columns.includes('content, metadata')) return emptyCompletedMessagesChain
                return emptyCompletedMessagesChain
            }),
        }
        const conversations = [
            createConversationChain(),
            createConversationChain(),
            createConversationChain(),
            createConversationChain(),
        ]
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) throw new Error('Unexpected conversation lookup')
                return { select: vi.fn(() => chain) }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Bu programda staj kaç iş günü?',
        }), createContext())

        expect(res.status).toBe(202)
        await expect(res.json()).resolves.toEqual({ pending: true })
        expect(buildRagContextMock).not.toHaveBeenCalled()
        expect(generateGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(repairLinkOnlyRagAnswerMock).not.toHaveBeenCalled()
        expect(appendCanonicalRagSourceLinksMock).not.toHaveBeenCalled()
    })

    it('allows deterministic contextual repair only when retrieved evidence contains the prior explicit topic anchor', async () => {
        const chunk = {
            content: 'Tıbbi Laboratuvar Teknikleri programında zorunlu yaz stajı 20 iş günü olarak uygulanır.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        searchKnowledgeBaseMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 12,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Bu programda staj kaç iş günü?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const historyMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(async () => ({
                data: [
                    {
                        content: 'Bu programda staj kaç iş günü?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'previous-followup' },
                    },
                    {
                        content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'previous-message' },
                    },
                ],
                error: null,
            })),
        }
        historyMessagesChain.eq.mockReturnValue(historyMessagesChain)
        historyMessagesChain.order.mockReturnValue(historyMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns === 'id, content') return inboundMessagesChain
                if (columns === 'content, sender_type, metadata') return historyMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Bu programda staj kaç iş günü?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf',
            skillImage: null,
        })
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı? Bu programda staj kaç iş günü?',
            'org-1',
            0.5,
            6,
            expect.any(Object)
        )
        expect(repairLinkOnlyRagAnswerMock).toHaveBeenCalled()
        expect(generateGroundedRagAnswerMock).not.toHaveBeenCalled()
    })

    it('anchors contextual follow-ups to the latest explicit topic instead of older conversation topics', async () => {
        const olderChunk = {
            content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.',
            document_id: 'doc-sbf',
            document_title: 'Sağlık Bilimleri Fakültesi',
            source_url: 'https://example.edu.tr/sbf.pdf',
        }
        const latestChunk = {
            content: 'Tıbbi Laboratuvar Teknikleri programında zorunlu yaz stajı 20 iş günü olarak uygulanır.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        searchKnowledgeBaseMock.mockResolvedValueOnce([olderChunk, latestChunk])
        buildRagContextMock.mockReturnValueOnce({
            context: latestChunk.content,
            chunks: [latestChunk],
            tokenCount: 12,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Bu programda staj kaç iş günü?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const historyMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(),
            limit: vi.fn(async () => ({
                data: [
                    {
                        content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'latest-topic' },
                    },
                    {
                        content: 'Sağlık Bilimleri Fakültesi kampüsü nerede?',
                        sender_type: 'contact',
                        metadata: { demo_chat_message_id: 'older-topic' },
                    },
                ],
                error: null,
            })),
        }
        historyMessagesChain.eq.mockReturnValue(historyMessagesChain)
        historyMessagesChain.order.mockReturnValue(historyMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns === 'id, content') return inboundMessagesChain
                if (columns === 'content, sender_type, metadata') return historyMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Bu programda staj kaç iş günü?',
        }), createContext())

        expect(res.status).toBe(200)
        expect(buildRagContextMock).toHaveBeenCalledWith([latestChunk])
        expect(generateGroundedRagAnswerMock).not.toHaveBeenCalled()
    })

    it('falls back to broader knowledge search during polling before the shared pipeline', async () => {
        const chunks = [
            {
                content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.',
                document_id: 'doc-1',
                document_title: 'Sağlık Bilimleri Fakültesi',
                source_url: 'https://example.edu.tr/sbf.pdf',
            },
            {
                content: 'Genel ders materyali duyuruları ve erişilebilirlik düzenlemeleri.',
                document_id: 'doc-2',
                document_title: 'Genel Bilgilendirme',
                source_url: 'https://example.edu.tr/generic.pdf',
            }
        ]
        searchKnowledgeBaseMock.mockResolvedValueOnce(chunks)
        buildRagContextMock.mockReturnValueOnce({
            context: chunks.map((chunk) => chunk.content).join('\n---\n'),
            chunks,
            tokenCount: 12,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce('Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.')
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.\nhttps://example.edu.tr/sbf.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'SBF kampüsü nerede?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'SBF kampüsü nerede?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.\nhttps://example.edu.tr/sbf.pdf',
            skillImage: null,
        })
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'SBF kampüsü nerede?',
            'org-1',
            0.5,
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            conversation_id: 'conversation-1',
            organization_id: 'org-1',
            sender_type: 'bot',
            content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.\nhttps://example.edu.tr/sbf.pdf',
            metadata: expect.objectContaining({
                demo_chat_reply_kind: 'text',
                demo_chat_reply_to_message_id: 'message-1',
                is_rag: true,
                rag_extractive: true,
                sources: ['doc-1'],
            }),
        }))
    })

    it('returns deterministic compound demo RAG replies without polish and appends multiple canonical source URLs', async () => {
        const chunks = [
            {
                content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.',
                document_id: 'doc-sbf',
                document_title: 'Sağlık Bilimleri Fakültesi',
                source_url: 'https://example.edu.tr/sbf.pdf',
            },
            {
                content: 'Sağlık Hizmetleri Meslek Yüksekokulu kampüsü Karakaya Mahallesi Bağlum Bulvarı No:1, 06291 Keçiören/Ankara adresindedir.',
                document_id: 'doc-shmyo',
                document_title: 'Sağlık Hizmetleri Meslek Yüksekokulu',
                source_url: 'https://example.edu.tr/shmyo.pdf',
            }
        ]
        searchKnowledgeBaseMock.mockImplementation(async (query: string) => {
            if (query.includes('SHMYO') || query.includes('Sağlık Hizmetleri')) return [chunks[1]!]
            return [chunks[0]!]
        })
        buildRagContextMock.mockReturnValueOnce({
            context: chunks.map((chunk) => chunk.content).join('\n---\n'),
            chunks,
            tokenCount: 32,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir. Sağlık Hizmetleri Meslek Yüksekokulu Karakaya Mahallesi Bağlum Bulvarı No:1 adresindedir.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir. Sağlık Hizmetleri Meslek Yüksekokulu Karakaya Mahallesi Bağlum Bulvarı No:1 adresindedir.\nhttps://example.edu.tr/sbf.pdf\nhttps://example.edu.tr/shmyo.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'SBF ve SHMYO kampüsleri nerede?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'SBF ve SHMYO kampüsleri nerede?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir. Sağlık Hizmetleri Meslek Yüksekokulu Karakaya Mahallesi Bağlum Bulvarı No:1 adresindedir.\nhttps://example.edu.tr/sbf.pdf\nhttps://example.edu.tr/shmyo.pdf',
            skillImage: null,
        })
        expect(getOrgAiSettingsMock).not.toHaveBeenCalled()
        expect(generateGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(polishGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(recordAiUsageMock).not.toHaveBeenCalled()
        expect(searchKnowledgeBaseFocusedEvidenceMock).not.toHaveBeenCalledWith(
            'SBF ve SHMYO kampüsleri nerede?',
            expect.any(String),
            expect.any(Number),
            expect.any(Object)
        )
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'SBF kampüsleri nerede?',
            'org-1',
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'SHMYO kampüsleri nerede?',
            'org-1',
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'SBF kampüsleri nerede?',
            'org-1',
            0.5,
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'SHMYO kampüsleri nerede?',
            'org-1',
            0.5,
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir. Sağlık Hizmetleri Meslek Yüksekokulu Karakaya Mahallesi Bağlum Bulvarı No:1 adresindedir.',
            chunks,
            expect.objectContaining({ force: true, limit: 2 })
        )
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                rag_generate: null,
                rag_polish: null,
            })
        }))
    })

    it('uses grounded answer generation before deterministic repair in demo recovery', async () => {
        const chunk = {
            content: [
                'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
                'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.',
            ].join('\n'),
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 20,
        })
        generateGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.',
            usedGeneration: true,
            addedEngagement: true,
            usage: { inputTokens: 120, outputTokens: 45, totalTokens: 165 },
            model: 'gpt-4o-mini',
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(null)
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.\nhttps://example.edu.tr/tlt.pdf',
            skillImage: null,
        })
        expect(generateGroundedRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks: [chunk],
            settings: {
                prompt: 'Samimi cevap ver.',
                bot_name: 'Qualy',
            },
            timeoutMs: 3500,
        }))
        expect(repairLinkOnlyRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            response: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.',
            userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            responseLanguage: 'tr',
            chunks: [chunk],
        }))
        expect(polishGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(recordAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            category: 'rag',
            model: 'gpt-4o-mini',
            inputTokens: 120,
            outputTokens: 45,
            totalTokens: 165,
            metadata: expect.objectContaining({
                source: 'demo_chat_rag_generate',
                response_kind: 'rag_grounded_generate',
                conversation_id: 'conversation-1',
            })
        }))
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                rag_generate: {
                    usedGeneration: true,
                    addedEngagement: true,
                    model: 'gpt-4o-mini',
                }
            })
        }))
    })

    it('creates the demo conversation before recording generated RAG usage', async () => {
        const chunk = {
            content: 'Üniversitede personelin yıllık izin süreleri hizmet süresine göre değişir.',
            document_id: 'doc-leave',
            document_title: 'Personel İzinleri',
            source_url: 'https://example.edu.tr/izin.pdf',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 18,
        })
        generateGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'Personelin yıllık izin süresi hizmet süresine göre 14, 20 veya 26 iş günüdür.',
            usedGeneration: true,
            addedEngagement: true,
            usage: { inputTokens: 90, outputTokens: 35, totalTokens: 125 },
            model: 'gpt-4o-mini',
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(null)
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Personelin yıllık izin süresi hizmet süresine göre 14, 20 veya 26 iş günüdür.\nhttps://example.edu.tr/izin.pdf'
        )

        const createConversationChain = (id: string | null) => {
            const chain = {
                eq: vi.fn(),
                maybeSingle: vi.fn(async () => ({
                    data: id ? { id } : null,
                    error: null,
                })),
            }
            chain.eq.mockReturnValue(chain)
            return chain
        }
        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'personelin yıllık izni ne kadar?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }
        const conversations = [
            createConversationChain(null),
            createConversationChain(null),
            createConversationChain('conversation-1'),
            createConversationChain('conversation-1'),
        ]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns === 'id') return duplicateReplyChain
                throw new Error(`Unexpected messages select ${columns}`)
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'personelin yıllık izni ne kadar?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Personelin yıllık izin süresi hizmet süresine göre 14, 20 veya 26 iş günüdür.\nhttps://example.edu.tr/izin.pdf',
            skillImage: null,
        })
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            inboundMessageId: 'message-1',
            skipAutomation: true,
        }))
        expect(recordAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                source: 'demo_chat_rag_generate',
                conversation_id: 'conversation-1',
            })
        }))
        expect(processInboundAiPipelineMock.mock.invocationCallOrder[0]).toBeLessThan(
            recordAiUsageMock.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY
        )
    })

    it('returns deterministic repaired demo RAG replies without waiting for generation or polish', async () => {
        const chunk = {
            content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 12,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf',
            skillImage: null,
        })
        expect(getOrgAiSettingsMock).not.toHaveBeenCalled()
        expect(generateGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(polishGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(recordAiUsageMock).not.toHaveBeenCalled()
        expect(botInsertChain.insert).toHaveBeenCalledWith(expect.objectContaining({
            metadata: expect.objectContaining({
                rag_generate: null,
                rag_polish: null,
            })
        }))
    })

    it('uses selected grounded generation sources for demo repair, polish, and source links', async () => {
        const chunk = {
            content: 'Yaz Stajı süresi 20 iş günüdür.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            chunk_id: 'chunk-tlt',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }
        const broadChunk = {
            content: 'Hemşirelik programında farklı klinik uygulama süreleri bulunur.',
            document_id: 'doc-noise',
            document_title: 'Hemşirelik Programı',
            chunk_id: 'chunk-noise',
            source_url: 'https://example.edu.tr/noise.pdf',
        }
        const selectedSourceChunks = [{
            content: 'Yaz Stajı süresi 20 iş günüdür.',
            document_id: 'doc-tlt',
            document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
            chunk_id: 'chunk-tlt',
            source_url: 'https://example.edu.tr/tlt.pdf',
        }]
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk, broadChunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk, broadChunk],
            tokenCount: 40,
        })
        generateGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'TLT yaz stajı 20 iş günüdür.',
            usedGeneration: true,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
            usedEvidenceIds: ['ev_1'],
            sourceChunks: selectedSourceChunks,
        })
        repairLinkOnlyRagAnswerMock
            .mockReturnValueOnce(null)
            .mockReturnValueOnce('TLT yaz stajı 20 iş günüdür.')
        polishGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'TLT yaz stajı 20 iş günüdür.',
            usedPolish: true,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
        })
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'TLT yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'TLT yaz stajı kaç gün?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'TLT yaz stajı kaç gün?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'TLT yaz stajı 20 iş günüdür.\nhttps://example.edu.tr/tlt.pdf',
            skillImage: null,
        })
        const generatedRepairCalls = repairLinkOnlyRagAnswerMock.mock.calls
            .map(([call]) => call)
            .filter((call) => call.response === 'TLT yaz stajı 20 iş günüdür.')
        expect(generatedRepairCalls).toHaveLength(2)
        expect(generatedRepairCalls).toEqual([
            expect.objectContaining({
                userMessage: 'TLT yaz stajı kaç gün?',
                responseLanguage: 'tr',
                chunks: [expect.objectContaining({ document_id: 'doc-tlt' })],
            }),
            expect.objectContaining({
                userMessage: 'TLT yaz stajı kaç gün?',
                responseLanguage: 'tr',
                chunks: [expect.objectContaining({ document_id: 'doc-tlt' })],
            }),
        ])
        expect(polishGroundedRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            answer: 'TLT yaz stajı 20 iş günüdür.',
            userMessage: 'TLT yaz stajı kaç gün?',
            responseLanguage: 'tr',
            chunks: [expect.objectContaining({ document_id: 'doc-tlt' })],
        }))
        expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
            expect.stringContaining('20 iş günüdür'),
            [expect.objectContaining({ document_id: 'doc-tlt' })],
            expect.objectContaining({ force: true, limit: 2 })
        )
    })

    it('returns deterministic contact demo replies without polish before appending sources', async () => {
        const chunk = {
            content: 'Page Title: İletişim\nTelefon +90 312 329 10 10 Fax +90 312 329 10 15 E-Posta yiu@yiu.edu.tr',
            document_id: 'doc-contact',
            document_title: 'İletişim',
            source_url: 'https://example.edu.tr/iletisim',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 18,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.'
        )
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.\nhttps://example.edu.tr/iletisim'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'Yuksek Ihtisas Universitesi genel telefon numarasi nedir?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: null,
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'Yuksek Ihtisas Universitesi genel telefon numarasi nedir?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.\nhttps://example.edu.tr/iletisim',
            skillImage: null,
        })
        expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
            'Kurum iletişim bilgisi: Telefon: +90 312 329 10 10 - E-posta: yiu@yiu.edu.tr.',
            [chunk],
            expect.objectContaining({ force: true, limit: 2 })
        )
        expect(getOrgAiSettingsMock).not.toHaveBeenCalled()
        expect(generateGroundedRagAnswerMock).not.toHaveBeenCalled()
        expect(polishGroundedRagAnswerMock).not.toHaveBeenCalled()
    })

    it('does not insert a duplicate deterministic demo reply if another poll already persisted it', async () => {
        const chunk = {
            content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.',
            document_id: 'doc-1',
            document_title: 'Sağlık Bilimleri Fakültesi',
            source_url: 'https://example.edu.tr/sbf.pdf',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 12,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce('Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.')
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.\nhttps://example.edu.tr/sbf.pdf'
        )

        const conversationChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'conversation-1' },
                error: null,
            })),
        }
        conversationChain.eq.mockReturnValue(conversationChain)

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'SBF kampüsü nerede?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const duplicateReplyChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: { id: 'bot-message-1' },
                error: null,
            })),
        }
        duplicateReplyChain.eq.mockReturnValue(duplicateReplyChain)

        const botInsertChain = {
            insert: vi.fn(async () => ({ error: null })),
        }
        const conversationUpdateChain = {
            update: vi.fn(() => conversationUpdateChain),
            eq: vi.fn(async () => ({ error: null })),
        }

        const conversations = [conversationChain, conversationChain, conversationChain, conversationChain, conversationChain]
        const messagesTable = {
            select: vi.fn((columns: string) => {
                if (columns.includes('id, content')) return inboundMessagesChain
                if (columns.includes('content, metadata')) return completedMessagesChain
                if (columns === 'id') return duplicateReplyChain
                return completedMessagesChain
            }),
            insert: botInsertChain.insert,
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) return conversationUpdateChain
                return { select: vi.fn(() => chain), update: conversationUpdateChain.update }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        processInboundAiPipelineMock.mockImplementationOnce(async () => undefined)

        const res = await GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'SBF kampüsü nerede?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.\nhttps://example.edu.tr/sbf.pdf',
            skillImage: null,
        })
        expect(botInsertChain.insert).not.toHaveBeenCalled()
        expect(conversationUpdateChain.update).not.toHaveBeenCalled()
    })

    it('keeps polling pending when recovery processing is slower than the sync reply budget', async () => {
        vi.useFakeTimers()
        vi.stubEnv('DEMO_CHAT_SYNC_REPLY_TIMEOUT_MS', '1000')
        vi.stubEnv('DEMO_CHAT_FAST_RAG_REPLY_TIMEOUT_MS', '1000')
        const createConversationChain = () => {
            const chain = {
                eq: vi.fn(),
                maybeSingle: vi.fn(async () => ({
                    data: { id: 'conversation-1' },
                    error: null,
                })),
            }
            chain.eq.mockReturnValue(chain)
            return chain
        }

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'personelin ücretsiz izin süresi ne kadar',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const conversations = [createConversationChain(), createConversationChain(), createConversationChain()]
        const messagesTable = {
            select: vi.fn((columns: string) => (
                columns.includes('metadata') ? completedMessagesChain : inboundMessagesChain
            )),
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) throw new Error('Unexpected conversation lookup')
                return { select: vi.fn(() => chain) }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        searchKnowledgeBaseFocusedEvidenceMock.mockImplementationOnce(async () => {
            await new Promise<never>(() => {})
        })

        const responsePromise = GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
        }), createContext())
        let settled = false
        responsePromise.then(() => {
            settled = true
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(1000)
        await Promise.resolve()

        expect(settled).toBe(true)
        const res = await responsePromise
        expect(res.status).toBe(202)
        await expect(res.json()).resolves.toEqual({ pending: true })
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('caps slow polling recovery below the production platform timeout even when env is too high', async () => {
        vi.useFakeTimers()
        vi.stubEnv('DEMO_CHAT_SYNC_REPLY_TIMEOUT_MS', '28000')
        const createConversationChain = () => {
            const chain = {
                eq: vi.fn(),
                maybeSingle: vi.fn(async () => ({
                    data: { id: 'conversation-1' },
                    error: null,
                })),
            }
            chain.eq.mockReturnValue(chain)
            return chain
        }

        const completedMessagesChain = {
            eq: vi.fn(),
            order: vi.fn(async () => ({
                data: [],
                error: null,
            })),
        }
        completedMessagesChain.eq.mockReturnValue(completedMessagesChain)

        const inboundMessagesChain = {
            eq: vi.fn(),
            maybeSingle: vi.fn(async () => ({
                data: {
                    id: 'contact-message-1',
                    content: 'SBF kampüsü nerede?',
                },
                error: null,
            })),
        }
        inboundMessagesChain.eq.mockReturnValue(inboundMessagesChain)

        const conversations = [createConversationChain(), createConversationChain()]
        const messagesTable = {
            select: vi.fn((columns: string) => (
                columns.includes('metadata') ? completedMessagesChain : inboundMessagesChain
            )),
        }
        const fromMock = vi.fn((table: string) => {
            if (table === 'conversations') {
                const chain = conversations.shift()
                if (!chain) throw new Error('Unexpected conversation lookup')
                return { select: vi.fn(() => chain) }
            }
            if (table === 'messages') return messagesTable
            throw new Error(`Unexpected table ${table}`)
        })
        createClientMock.mockReturnValueOnce({ from: fromMock })
        searchKnowledgeBaseFocusedEvidenceMock.mockImplementationOnce(async () => {
            await new Promise<never>(() => {})
        })

        const responsePromise = GET(createGetRequest({
            sessionId: 'session-1',
            messageId: 'message-1',
            message: 'SBF kampüsü nerede?',
        }), createContext())
        let settled = false
        responsePromise.then(() => {
            settled = true
        })

        await vi.advanceTimersByTimeAsync(0)
        await vi.advanceTimersByTimeAsync(6_000)
        await Promise.resolve()

        expect(settled).toBe(true)
        const res = await responsePromise
        expect(res.status).toBe(202)
        await expect(res.json()).resolves.toEqual({ pending: true })
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })

    it('keeps parallel testers isolated with distinct pending message ids', async () => {
        const firstResponse = await POST(createRequest({
            sessionId: 'session-a',
            message: 'Birinci soru',
        }), createContext())
        const secondResponse = await POST(createRequest({
            sessionId: 'session-b',
            message: 'İkinci soru',
        }), createContext())
        const firstBody = await firstResponse.json()
        const secondBody = await secondResponse.json()

        expect(firstResponse.status).toBe(202)
        expect(secondResponse.status).toBe(202)
        expect(firstBody.messageId).toEqual(expect.any(String))
        expect(secondBody.messageId).toEqual(expect.any(String))
        expect(firstBody.messageId).not.toBe(secondBody.messageId)
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'Birinci soru',
            inboundMessageId: firstBody.messageId,
            skipAutomation: true,
        }))
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'İkinci soru',
            inboundMessageId: secondBody.messageId,
            skipAutomation: true,
        }))
    })

    it('rate-limits repeated demo chat posts per client session before running AI again', async () => {
        vi.stubEnv('DEMO_CHAT_RATE_LIMIT_PER_MINUTE', '1')

        const firstResponse = await POST(createRequest({
            sessionId: 'rate-session',
            message: 'İlk soru',
        }, { ip: '203.0.113.10' }), createContext())
        const secondResponse = await POST(createRequest({
            sessionId: 'rate-session',
            message: 'İkinci soru',
        }, { ip: '203.0.113.10' }), createContext())

        expect(firstResponse.status).toBe(202)
        expect(secondResponse.status).toBe(429)
        await expect(secondResponse.json()).resolves.toEqual({ error: 'Demo rate limit exceeded' })
        expect(processInboundAiPipelineMock).toHaveBeenCalledTimes(1)
        expect(processInboundAiPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            text: 'İlk soru',
            skipAutomation: true,
        }))
    })
})
