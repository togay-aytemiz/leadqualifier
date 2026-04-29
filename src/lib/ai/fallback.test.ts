import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    getOrgAiSettingsMock,
    openAiCreateMock,
    resolveOrganizationUsageEntitlementMock,
    searchKnowledgeBaseMock
} = vi.hoisted(() => ({
    getOrgAiSettingsMock: vi.fn(),
    openAiCreateMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn(),
    searchKnowledgeBaseMock: vi.fn()
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock
}))

vi.mock('@/lib/knowledge-base/actions', () => ({
    searchKnowledgeBase: searchKnowledgeBaseMock
}))

vi.mock('@/lib/knowledge-base/rag', () => ({
    buildRagContext: vi.fn(() => ({
        context: '',
        chunks: [],
        tokenCount: 0
    }))
}))

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: vi.fn()
}))

vi.mock('openai', () => ({
    default: class OpenAIMock {
        chat = {
            completions: {
                create: openAiCreateMock
            }
        }
    }
}))

import { buildFallbackResponse } from '@/lib/ai/fallback'

function createSupabaseMock() {
    return {
        from: vi.fn((table: string) => {
            if (table === 'skills') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                order: vi.fn(() => ({
                                    limit: vi.fn(async () => ({ data: [], error: null }))
                                }))
                            }))
                        }))
                    }))
                }
            }
            if (table === 'knowledge_documents') {
                return {
                    select: vi.fn(() => ({
                        eq: vi.fn(() => ({
                            eq: vi.fn(() => ({
                                order: vi.fn(() => ({
                                    limit: vi.fn(async () => ({ data: [], error: null }))
                                }))
                            }))
                        }))
                    }))
                }
            }
            throw new Error(`Unexpected query for table: ${table}`)
        })
    }
}

describe('buildFallbackResponse', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.OPENAI_API_KEY = 'test-openai-key'
        getOrgAiSettingsMock.mockResolvedValue({
            prompt: 'You are helpful.',
            bot_name: 'Bot'
        })
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true
        })
        searchKnowledgeBaseMock.mockResolvedValue([])
        openAiCreateMock.mockResolvedValue({
            choices: [{ message: { content: 'The premium package is 5000 TL.' } }]
        })
    })

    it('uses strict fallback instead of generating ungrounded details when no KB context exists', async () => {
        const response = await buildFallbackResponse({
            organizationId: 'org-1',
            message: 'Premium paket fiyatı nedir?',
            preferredLanguage: 'tr',
            supabase: createSupabaseMock() as never,
            trackUsage: false
        })

        expect(response).toBe('Şu konularda yardımcı olabilirim: fiyatlar, randevu, iptal/iade, hizmetler. Hangisiyle ilgileniyorsunuz?')
        expect(openAiCreateMock).not.toHaveBeenCalled()
    })
})
