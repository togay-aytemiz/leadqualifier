import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    getOrgAiDictionaryEntriesMock,
    getOrgAiSettingsMock,
    recordAiUsageMock,
    runSimpleRagPipelineMock,
} = vi.hoisted(() => ({
    getOrgAiDictionaryEntriesMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    runSimpleRagPipelineMock: vi.fn(),
}))

vi.mock('openai', () => ({
    default: vi.fn(function MockOpenAI() {
        return { responses: { create: vi.fn() } }
    }),
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock,
}))

vi.mock('@/lib/ai/dictionary', () => ({
    getOrgAiDictionaryEntries: getOrgAiDictionaryEntriesMock,
}))

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: recordAiUsageMock,
}))

vi.mock('@/lib/knowledge-base/simple-rag/pipeline', () => ({
    runSimpleRagPipeline: runSimpleRagPipelineMock,
}))

import { buildOpenAiFileSearchDemoReply } from './openai-file-search'

const channel = {
    id: 'demo-channel-1',
    organizationId: 'org-1',
    slug: 'yiu-tanitim-gunleri-2026',
    displayName: 'YIU Demo',
    logoUrl: null,
    maintenanceEnabled: false,
    sharedSecretHash: 'sha256:test',
}

describe('buildOpenAiFileSearchDemoReply', () => {
    beforeEach(() => {
        getOrgAiDictionaryEntriesMock.mockResolvedValue([])
    })

    afterEach(() => {
        vi.unstubAllEnvs()
        vi.clearAllMocks()
    })

    it('routes the demo directly through the simple standalone-query pipeline', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiDictionaryEntriesMock.mockResolvedValue([
            {
                id: 'dict-1',
                organization_id: 'org-1',
                term: 'ftr',
                normalized_term: 'ftr',
                meanings: ['Fizyoterapi ve Rehabilitasyon', 'Fizyoterapi ön lisans'],
                enabled: true,
                created_at: '2026-06-18T00:00:00Z',
                updated_at: '2026-06-18T00:00:00Z',
            },
        ])
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
        })
        runSimpleRagPipelineMock.mockResolvedValue({
            provider: 'openai_file_search_validated',
            answer:
                'Tıp Fakültesi için 2025 broşüründe Ücretli fiyat 720.000 TL, %50 indirimli fiyat 360.000 TL olarak listelenir. Burslu kontenjan satırında fiyat alanı "-" olarak gösterilir.\nhttps://example.edu.tr/brochure.pdf',
            citations: [
                {
                    providerSourceId: 'strict-catalog:program-fees-2025',
                    title: 'Program Ücretleri',
                    quote:
                        'Tıp Fakültesi ücretli fiyat 720.000 TL; %50 indirimli fiyat 360.000 TL; burslu kontenjan.',
                    url: 'https://example.edu.tr/brochure.pdf',
                },
            ],
            refusal: false,
            timingsMs: { total: 10, retrieval: 0, generation: 0, validation: 0 },
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, toolCalls: 0 },
            diagnostics: {
                strictVerdict: 'catalog_program_fee_fact',
                simpleRag: {
                    standaloneQuery: 'Tıp Fakültesi ücreti nedir?',
                    stateUsed: true,
                    resultCount: 1,
                    topScores: [0.95],
                    selectedChunkIds: ['C1'],
                    selectedFilenames: ['fees.md'],
                    answerStatus: 'answer',
                }
            },
        })
        recordAiUsageMock.mockResolvedValue(undefined)

        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'tip kaç para',
            conversationId: 'conv-1',
            conversationHistory: [{ role: 'user', content: 'Tıp Fakültesini soruyorum.' }],
            pendingClarification: {
                originalQuestion: 'Tıp ücreti nedir?',
                clarificationQuestion: 'Türkçe mi İngilizce mi?',
                missingSlots: ['program_language'],
            },
        })

        expect(runSimpleRagPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            latestUserMessage: 'tip kaç para',
            organizationContext: 'YIU Demo',
            recentMessages: [{ role: 'user', content: 'Tıp Fakültesini soruyorum.' }],
            pendingClarification: expect.objectContaining({
                originalQuestion: 'Tıp ücreti nedir?',
            }),
            responseLanguage: 'tr',
            answerModel: 'gpt-4.1-mini',
            maxResults: 20,
            scoreThreshold: 0,
            settings: {
                bot_name: 'Qualy',
                prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
            },
            dictionaryContext: 'ftr => Fizyoterapi ve Rehabilitasyon | Fizyoterapi ön lisans',
        }))
        expect(result?.replyText).toContain('Tıp Fakültesi için 2025 broşüründe')
        expect(result?.replyText).toContain('https://example.edu.tr/brochure.pdf')
        expect(result?.metadata.rag_file_search).toMatchObject({
            pipeline_version: 'simple_standalone_query_v1',
            max_results: 20,
            score_threshold: 0,
        })
        expect(result?.metadata.rag_file_search).not.toHaveProperty('final_polish')
    })

    it('uses recent conversation language for ambiguous short follow-ups', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Kısa ve net Türkçe konuş.',
        })
        runSimpleRagPipelineMock.mockResolvedValue({
            provider: 'openai_file_search_validated',
            answer: 'English Medicine tuition is 720,000 TL; discounted tuition is 360,000 TL.',
            citations: [],
            refusal: false,
            timingsMs: { total: 10, retrieval: 0, generation: 0, validation: 0 },
            usage: { inputTokens: 80, outputTokens: 16, totalTokens: 96, toolCalls: 0 },
            diagnostics: {},
        })
        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'ingilizcesi?',
            conversationId: 'conv-1',
            conversationHistory: [
                { role: 'user', content: 'tıp kaç para' },
                {
                    role: 'assistant',
                    content: 'Tıp Fakültesi için ücret 720.000 TL, %50 indirimli ücret 360.000 TL.',
                },
            ],
        })

        expect(getOrgAiSettingsMock).toHaveBeenCalledWith('org-1', expect.objectContaining({
            locale: 'tr',
        }))
        expect(runSimpleRagPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            latestUserMessage: 'ingilizcesi?',
            responseLanguage: 'tr',
            recentMessages: expect.arrayContaining([
                expect.objectContaining({ role: 'user', content: 'tıp kaç para' }),
            ]),
        }))
        expect(result?.replyText).toContain('English Medicine')
    })

    it('passes the canonical institution name from AI settings into simple RAG scope', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'YİÜ Tanıtım Asistanı',
            prompt: 'Yüksek İhtisas Üniversitesi Tanıtım Günleri aday öğrenci asistanı gibi konuş.',
        })
        runSimpleRagPipelineMock.mockResolvedValue({
            provider: 'openai_file_search_validated',
            answer: 'Yüksek İhtisas Üniversitesi fakülteleri listelenmiştir.',
            citations: [],
            refusal: false,
            timingsMs: { total: 10, retrieval: 0, generation: 0, validation: 0 },
            usage: { inputTokens: 80, outputTokens: 16, totalTokens: 96, toolCalls: 0 },
            diagnostics: {},
        })

        await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'hangi fakülteler var?',
        })

        expect(runSimpleRagPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationContext: 'Yüksek İhtisas Üniversitesi / YIU Demo',
        }))
    })

    it('does not fall back to the legacy RAG path when the simple pipeline fails', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Kısa ve net cevap ver.',
        })
        runSimpleRagPipelineMock.mockRejectedValueOnce(new Error('vector search unavailable'))

        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'kampüs nerede?',
        })

        expect(result).not.toBeNull()
        expect(result?.replyText).toBe(
            'Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin.'
        )
        expect(result?.metadata).toMatchObject({
            demo_chat_reply_source: 'simple_standalone_query_rag',
            rag_file_search: {
                pipeline_version: 'simple_standalone_query_v1',
                failure_reason: 'pipeline_error',
            },
        })
    })
})
