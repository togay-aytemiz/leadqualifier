import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
import { createDemoChatAccessToken } from '@/lib/demo-chat/access'

const {
    appendCanonicalRagSourceLinksMock,
    buildDemoChatContactIdMock,
    buildRagContextMock,
    createClientMock,
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

    it('uses focused evidence recovery before broad knowledge search during polling', async () => {
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

        const conversations = [conversationChain, conversationChain, conversationChain]
        let messageSelectCount = 0
        const messagesTable = {
            select: vi.fn((columns: string) => {
                messageSelectCount += 1
                if (messageSelectCount === 1) return completedMessagesChain
                if (messageSelectCount === 2) return inboundMessagesChain
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

    it('returns deterministic knowledge replies during polling without running the full AI pipeline', async () => {
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

        const conversations = [conversationChain, conversationChain, conversationChain]
        let messageSelectCount = 0
        const messagesTable = {
            select: vi.fn((columns: string) => {
                messageSelectCount += 1
                if (messageSelectCount === 1) return completedMessagesChain
                if (messageSelectCount === 2) return inboundMessagesChain
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

    it('polishes deterministic demo RAG replies and can append multiple canonical source URLs', async () => {
        const chunks = [
            {
                content: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir.',
                document_id: 'doc-sbf',
                document_title: 'Sağlık Bilimleri Fakültesi',
                source_url: 'https://example.edu.tr/sbf.pdf',
            },
            {
                content: 'Tıbbi Laboratuvar Teknikleri Programı öğrencileri Eczane Hizmetleri Programında çift anadal yapabilir.',
                document_id: 'doc-tlt-cap',
                document_title: 'TLT Çift Anadal',
                source_url: 'https://example.edu.tr/tlt-cap.pdf',
            }
        ]
        searchKnowledgeBaseMock.mockImplementation(async (query: string) => {
            if (query.includes('TLT') || query.includes('Tıbbi Laboratuvar')) return [chunks[1]!]
            return [chunks[0]!]
        })
        buildRagContextMock.mockReturnValueOnce({
            context: chunks.map((chunk) => chunk.content).join('\n---\n'),
            chunks,
            tokenCount: 32,
        })
        repairLinkOnlyRagAnswerMock.mockReturnValueOnce(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir. Tıbbi Laboratuvar Teknikleri Programında çift anadal mümkündür.'
        )
        polishGroundedRagAnswerMock.mockResolvedValueOnce({
            answer: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesinde yer alıyor. Tıbbi Laboratuvar Teknikleri Programında da Eczane Hizmetleri ile çift anadal yapılabiliyor.\n\nİstersen çift anadal başvuru koşullarını da kısaca çıkarabilirim.',
            usedPolish: true,
            addedEngagement: true,
            usage: { inputTokens: 80, outputTokens: 30, totalTokens: 110 },
            model: 'gpt-4o-mini',
        })
        appendCanonicalRagSourceLinksMock.mockReturnValueOnce(
            'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesinde yer alıyor. Tıbbi Laboratuvar Teknikleri Programında da Eczane Hizmetleri ile çift anadal yapılabiliyor.\n\nİstersen çift anadal başvuru koşullarını da kısaca çıkarabilirim.\nhttps://example.edu.tr/sbf.pdf\nhttps://example.edu.tr/tlt-cap.pdf'
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
                    content: 'SBF kampüsü nerede ve TLT çift anadal yapabilir mi?',
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

        const conversations = [conversationChain, conversationChain, conversationChain]
        let messageSelectCount = 0
        const messagesTable = {
            select: vi.fn((columns: string) => {
                messageSelectCount += 1
                if (messageSelectCount === 1) return completedMessagesChain
                if (messageSelectCount === 2) return inboundMessagesChain
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
            message: 'SBF kampüsü nerede ve TLT çift anadal yapabilir mi?',
        }), createContext())

        expect(res.status).toBe(200)
        await expect(res.json()).resolves.toEqual({
            pending: false,
            response: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesinde yer alıyor. Tıbbi Laboratuvar Teknikleri Programında da Eczane Hizmetleri ile çift anadal yapılabiliyor.\n\nİstersen çift anadal başvuru koşullarını da kısaca çıkarabilirim.\nhttps://example.edu.tr/sbf.pdf\nhttps://example.edu.tr/tlt-cap.pdf',
            skillImage: null,
        })
        expect(polishGroundedRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            answer: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesindedir. Tıbbi Laboratuvar Teknikleri Programında çift anadal mümkündür.',
            userMessage: 'SBF kampüsü nerede ve TLT çift anadal yapabilir mi?',
            chunks,
        }))
        expect(getOrgAiSettingsMock).toHaveBeenCalledWith('org-1', {
            supabase: expect.any(Object),
            locale: 'tr'
        })
        expect(searchKnowledgeBaseFocusedEvidenceMock).not.toHaveBeenCalledWith(
            'SBF kampüsü nerede ve TLT çift anadal yapabilir mi?',
            expect.any(String),
            expect.any(Number),
            expect.any(Object)
        )
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'SBF kampüsü nerede?',
            'org-1',
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseFocusedEvidenceMock).toHaveBeenCalledWith(
            'TLT çift anadal yapabilir mi?',
            'org-1',
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'SBF kampüsü nerede?',
            'org-1',
            0.5,
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(searchKnowledgeBaseMock).toHaveBeenCalledWith(
            'TLT çift anadal yapabilir mi?',
            'org-1',
            0.5,
            6,
            expect.objectContaining({ supabase: expect.any(Object) })
        )
        expect(appendCanonicalRagSourceLinksMock).toHaveBeenCalledWith(
            expect.stringContaining('İstersen çift anadal başvuru koşullarını'),
            chunks,
            expect.objectContaining({ force: true, limit: 2 })
        )
        expect(recordAiUsageMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            category: 'rag',
            model: 'gpt-4o-mini',
            inputTokens: 80,
            outputTokens: 30,
            totalTokens: 110,
            metadata: expect.objectContaining({ source: 'demo_chat_rag_polish' })
        }))
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

        const conversations = [conversationChain, conversationChain, conversationChain]
        let messageSelectCount = 0
        const messagesTable = {
            select: vi.fn((columns: string) => {
                messageSelectCount += 1
                if (messageSelectCount === 1) return completedMessagesChain
                if (messageSelectCount === 2) return inboundMessagesChain
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
        processInboundAiPipelineMock.mockImplementationOnce(async () => {
            await new Promise<void>(() => {})
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
