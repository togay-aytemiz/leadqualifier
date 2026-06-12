import { afterEach, describe, expect, it, vi } from 'vitest'

const {
    getOrgAiSettingsMock,
    recordAiUsageMock,
    runLlmFirstFileSearchPipelineMock,
} = vi.hoisted(() => ({
    getOrgAiSettingsMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    runLlmFirstFileSearchPipelineMock: vi.fn(),
}))

vi.mock('openai', () => ({
    default: vi.fn(function MockOpenAI() {
        return { responses: { create: vi.fn() } }
    }),
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock,
}))

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: recordAiUsageMock,
}))

vi.mock('@/lib/knowledge-base/llm-first/pipeline', () => ({
    runLlmFirstFileSearchPipeline: runLlmFirstFileSearchPipelineMock,
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
    afterEach(() => {
        vi.unstubAllEnvs()
        vi.clearAllMocks()
    })

    it('routes the demo directly through the LLM-first File Search pipeline', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
        })
        runLlmFirstFileSearchPipelineMock.mockResolvedValue({
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
                presentationPolish: {
                    usedPolish: false,
                    addedEngagement: false,
                    model: 'gpt-4o-mini',
                },
            },
        })
        recordAiUsageMock.mockResolvedValue(undefined)

        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'tip kaç para',
            conversationId: 'conv-1',
        })

        expect(runLlmFirstFileSearchPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            latestUserMessage: 'tip kaç para',
            recentMessages: [],
            responseLanguage: 'tr',
            settings: {
                bot_name: 'Qualy',
                prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
            },
        }))
        expect(result?.replyText).toContain('Tıp Fakültesi için 2025 broşüründe')
        expect(result?.replyText).toContain('https://example.edu.tr/brochure.pdf')
        expect(result?.metadata.rag_file_search).toMatchObject({
            pipeline_version: 'llm_first_v1',
            final_polish: {
                usedPolish: false,
                addedEngagement: false,
                model: 'gpt-4o-mini',
            },
        })
    })

    it('uses recent conversation language for ambiguous short follow-ups', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Kısa ve net Türkçe konuş.',
        })
        runLlmFirstFileSearchPipelineMock.mockResolvedValue({
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
        expect(runLlmFirstFileSearchPipelineMock).toHaveBeenCalledWith(expect.objectContaining({
            latestUserMessage: 'ingilizcesi?',
            responseLanguage: 'tr',
            recentMessages: expect.arrayContaining([
                expect.objectContaining({ role: 'user', content: 'tıp kaç para' }),
            ]),
        }))
        expect(result?.replyText).toContain('English Medicine')
    })
})
