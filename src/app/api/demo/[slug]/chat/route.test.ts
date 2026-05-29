import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'

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
    sharedSecretHash: 'sha256:demo-secret-hash',
}

function createAccessToken(channel = demoChannel) {
    const token = createDemoChatAccessToken({ channel })
    if (!token) throw new Error('Expected demo access token')
    return token
}

function createRequest(body: unknown, options: { token?: string | null; ip?: string } = {}) {
    const token = options.token === undefined ? createAccessToken() : options.token
    const headers = new Headers({ 'content-type': 'application/json' })
    if (token) headers.set('authorization', `Bearer ${token}`)
    if (options.ip) headers.set('x-forwarded-for', options.ip)

    return new NextRequest('https://app.askqualy.com/api/demo/yiu-aday-asistani/chat', {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
    })
}

function createGetRequest(searchParams: Record<string, string>, options: { token?: string | null } = {}) {
    const url = new URL('https://app.askqualy.com/api/demo/yiu-aday-asistani/chat')
    for (const [key, value] of Object.entries(searchParams)) {
        url.searchParams.set(key, value)
    }

    const token = options.token === undefined ? createAccessToken() : options.token
    const headers = new Headers()
    if (token) headers.set('authorization', `Bearer ${token}`)

    return new NextRequest(url, { headers })
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
            message: 'Merhaba',
        }), createContext())

        expect(res.status).toBe(202)
        const body = await res.json()
        expect(body).toMatchObject({ pending: true })
        expect(typeof body.messageId).toBe('string')
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
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
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
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
        expect(searchKnowledgeBaseFocusedEvidenceMock).not.toHaveBeenCalled()
        expect(generateGroundedRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            userMessage: 'Bu programda staj kaç iş günü?',
            conversationHistory: expectedHistory,
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
        const chunk = {
            content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.',
            document_id: 'doc-1',
            document_title: 'Sağlık Bilimleri Fakültesi',
            source_url: 'https://example.edu.tr/sbf.pdf',
        }
        searchKnowledgeBaseMock.mockResolvedValueOnce([chunk])
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

    it('repairs grounded generated demo answers before appending source links', async () => {
        const chunk = {
            content: [
                'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer.',
                'Bütünleme sınavından alınan not final notu yerine geçer.',
                'Dönem içi kurul notu 80 ve üzerinde olan öğrenciler final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir.'
            ].join('\n'),
            document_id: 'doc-tip',
            document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
            source_url: 'https://example.edu.tr/tip.pdf',
        }
        searchKnowledgeBaseFocusedEvidenceMock.mockResolvedValueOnce([chunk])
        buildRagContextMock.mockReturnValueOnce({
            context: chunk.content,
            chunks: [chunk],
            tokenCount: 40,
        })
        generateGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'Evet, final sınavına girmeden bütünlemeye girebilirsiniz. Eğer dönem içi kurul notunuz 80 ve üzerinde ise final sınavına girmeksizin dönemi başarıyla tamamlarsınız.',
            usedGeneration: true,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
        })
        repairLinkOnlyRagAnswerMock
            .mockReturnValueOnce(null)
            .mockReturnValueOnce(
                'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.'
            )
        polishGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.',
            usedPolish: false,
            addedEngagement: false,
            usage: null,
            model: 'gpt-4o-mini',
        })
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.\nhttps://example.edu.tr/tip.pdf'
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
                    content: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
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
            message: 'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.\nhttps://example.edu.tr/tip.pdf',
            skillImage: null,
        })
        expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
            'Final sınavına girmesi gerektiği halde girmeyen öğrenciler bütünleme sınavına girer; bütünleme notu final notu yerine geçer.',
            [chunk],
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
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
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
        expect(processInboundAiPipelineMock).not.toHaveBeenCalled()
    })
})
