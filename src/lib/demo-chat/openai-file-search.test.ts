import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    getOrgAiDictionaryEntriesMock,
    getOrgAiSettingsMock,
    recordAiUsageMock,
    runOneStepFileSearchMock,
} = vi.hoisted(() => ({
    getOrgAiDictionaryEntriesMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    runOneStepFileSearchMock: vi.fn(),
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

vi.mock('@/lib/knowledge-base/simple-rag/one-step-file-search', () => ({
    runOneStepFileSearch: runOneStepFileSearchMock,
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

    it('routes the demo through one GPT-5.5 Responses File Search call', async () => {
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
        runOneStepFileSearchMock.mockResolvedValue({
            provider: 'openai_file_search',
            status: 'answer',
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
            timingsMs: { total: 10 },
            usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, toolCalls: 1 },
            diagnostics: {
                queries: ['Tıp Fakültesi ücreti nedir?'],
                resultCount: 1,
                topScores: [0.95],
            },
        })
        recordAiUsageMock.mockResolvedValue(undefined)

        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'tip kaç para',
            standaloneQuery: 'Yüksek İhtisas Üniversitesi Tıp Fakültesi ücreti nedir?',
            conversationId: 'conv-1',
            conversationHistory: [{ role: 'user', content: 'Tıp Fakültesini soruyorum.' }],
            pendingClarification: {
                originalQuestion: 'Tıp ücreti nedir?',
                clarificationQuestion: 'Türkçe mi İngilizce mi?',
                missingSlots: ['program_language'],
            },
        })

        expect(runOneStepFileSearchMock).toHaveBeenCalledWith(expect.objectContaining({
            latestUserMessage: 'tip kaç para',
            standaloneQuery: 'Yüksek İhtisas Üniversitesi Tıp Fakültesi ücreti nedir?',
            organizationContext: 'YIU Demo',
            recentMessages: [{ role: 'user', content: 'Tıp Fakültesini soruyorum.' }],
            responseLanguage: 'tr',
            model: 'gpt-5.5',
            maxResults: 20,
            assistantInstructionContext: expect.stringContaining('Bol emoji kullan'),
            dictionaryContext: 'ftr => Fizyoterapi ve Rehabilitasyon | Fizyoterapi ön lisans',
        }))
        expect(result?.replyText).toContain('Tıp Fakültesi için 2025 broşüründe')
        expect(result?.replyText).toContain('https://example.edu.tr/brochure.pdf')
        expect(result?.metadata.rag_file_search).toMatchObject({
            pipeline_version: 'one_step_responses_file_search_v1',
            answer_model: 'gpt-5.5',
            max_results: 20,
        })
        expect(result?.metadata.rag_file_search).not.toHaveProperty('final_polish')
    })

    it('uses recent conversation language for ambiguous short follow-ups', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Kısa ve net Türkçe konuş.',
        })
        runOneStepFileSearchMock.mockResolvedValue({
            provider: 'openai_file_search',
            status: 'answer',
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
        expect(runOneStepFileSearchMock).toHaveBeenCalledWith(expect.objectContaining({
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
        runOneStepFileSearchMock.mockResolvedValue({
            provider: 'openai_file_search',
            status: 'answer',
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

        expect(runOneStepFileSearchMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationContext: 'Yüksek İhtisas Üniversitesi / YIU Demo',
        }))
    })

    it('does not fall back to the legacy RAG path when the simple pipeline fails', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Kısa ve net cevap ver.',
        })
        runOneStepFileSearchMock.mockRejectedValueOnce(new Error('File Search unavailable'))

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
                pipeline_version: 'one_step_responses_file_search_v1',
                failure_reason: 'pipeline_error',
            },
        })
    })

    it('maps one-step no_info to the localized no-information reply', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({ bot_name: 'Qualy', prompt: 'Kısa konuş.' })
        runOneStepFileSearchMock.mockResolvedValue({
            provider: 'openai_file_search',
            status: 'no_info',
            answer: '',
            citations: [],
            refusal: false,
            timingsMs: { total: 10 },
            usage: { inputTokens: 50, outputTokens: 8, totalTokens: 58, toolCalls: 1 },
            diagnostics: { queries: ['Psikoloji bölümü'], resultCount: 3, topScores: [0.7] },
        })

        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'Psikoloji bölümü var mı?',
        })

        expect(result?.replyText).toBe('Bu konuda net bir bilgi bulamadım.')
        expect(result?.metadata.rag_file_search).toMatchObject({
            pipeline_version: 'one_step_responses_file_search_v1',
            answer_status: 'no_info',
            refusal: false,
        })
    })
})
