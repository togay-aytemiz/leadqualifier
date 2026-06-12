import { afterEach, describe, expect, it, vi } from 'vitest'

const {
    getOrgAiSettingsMock,
    polishGroundedRagAnswerMock,
    recordAiUsageMock,
    runOpenAiFileSearchValidatedQuestionMock,
} = vi.hoisted(() => ({
    getOrgAiSettingsMock: vi.fn(),
    polishGroundedRagAnswerMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    runOpenAiFileSearchValidatedQuestionMock: vi.fn(),
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

vi.mock('@/lib/knowledge-base/rag-eval/openai-file-search-validated', () => ({
    runOpenAiFileSearchValidatedQuestion: runOpenAiFileSearchValidatedQuestionMock,
}))

vi.mock('@/lib/knowledge-base/rag-answer-polish', () => ({
    polishGroundedRagAnswer: polishGroundedRagAnswerMock,
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

    it('polishes the final customer-facing File Search reply regardless of provider path', async () => {
        vi.stubEnv('OPENAI_API_KEY', 'sk-test')
        getOrgAiSettingsMock.mockResolvedValue({
            bot_name: 'Qualy',
            prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
        })
        runOpenAiFileSearchValidatedQuestionMock.mockResolvedValue({
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
        polishGroundedRagAnswerMock.mockResolvedValue({
            answer:
                'Tıp Fakültesi için 2025 ücretli program ücreti 720.000 TL, %50 indirimli ücret 360.000 TL. Burslu kontenjan için ücret alınmaz.',
            usedPolish: true,
            addedEngagement: false,
            usage: { inputTokens: 80, outputTokens: 24, totalTokens: 104 },
            model: 'gpt-4o-mini',
        })
        recordAiUsageMock.mockResolvedValue(undefined)

        const result = await buildOpenAiFileSearchDemoReply({
            supabase: {},
            channel,
            message: 'tip kaç para',
            conversationId: 'conv-1',
        })

        expect(runOpenAiFileSearchValidatedQuestionMock).toHaveBeenCalledWith(expect.objectContaining({
            organizationId: 'org-1',
            conversationId: 'conv-1',
            channel: 'demo_chat',
            question: 'tip kaç para',
            contextualOrchestratorMode: 'always',
            settings: {
                bot_name: 'Qualy',
                prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
            },
        }))
        expect(polishGroundedRagAnswerMock).toHaveBeenCalledWith(expect.objectContaining({
            answer: expect.stringContaining('2025 broşüründe Ücretli fiyat 720.000 TL'),
            userMessage: 'tip kaç para',
            settings: {
                bot_name: 'Qualy',
                prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
            },
        }))
        expect(result?.replyText).toContain('Tıp Fakültesi için 2025 ücretli program ücreti 720.000 TL')
        expect(result?.replyText).not.toContain('broşür')
        expect(result?.replyText).not.toContain('fiyat alanı')
        expect(result?.replyText).not.toContain('satır')
        expect(result?.replyText).toContain('https://example.edu.tr/brochure.pdf')
        expect(result?.metadata.rag_file_search).toMatchObject({
            final_polish: {
                usedPolish: true,
                addedEngagement: false,
                model: 'gpt-4o-mini',
            },
        })
    })
})
