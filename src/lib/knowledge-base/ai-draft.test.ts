import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'

const {
    openAiCreateMock,
    recordAiUsageMock,
    resolveOrganizationUsageEntitlementMock
} = vi.hoisted(() => ({
    openAiCreateMock: vi.fn(),
    recordAiUsageMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn()
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

vi.mock('@/lib/ai/usage', () => ({
    recordAiUsage: recordAiUsageMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock
}))

import {
    generateKnowledgeBaseDraftFromBrief,
    parseKnowledgeBaseDraftResponse
} from '@/lib/knowledge-base/ai-draft'

const originalOpenAiKey = process.env.OPENAI_API_KEY

describe('knowledge ai draft helper', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.OPENAI_API_KEY = 'test-openai-key'
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true,
            membershipState: 'active',
            lockReason: null
        })
    })

    afterAll(() => {
        if (typeof originalOpenAiKey === 'undefined') {
            delete process.env.OPENAI_API_KEY
            return
        }

        process.env.OPENAI_API_KEY = originalOpenAiKey
    })

    it('parses and trims a json title/content payload', () => {
        expect(
            parseKnowledgeBaseDraftResponse(
                JSON.stringify({
                    title: ' Klinik hakkında genel bilgi ',
                    content: '\n- Hizmetler\n- Süreç\n'
                })
            )
        ).toEqual({
            title: 'Klinik hakkında genel bilgi',
            content: '- Hizmetler\n- Süreç'
        })
    })

    it('returns null when the payload is missing title or content', () => {
        expect(parseKnowledgeBaseDraftResponse(JSON.stringify({ title: 'Eksik' }))).toBeNull()
        expect(parseKnowledgeBaseDraftResponse('not json')).toBeNull()
    })

    it('generates a knowledge base draft from a structured brief and records usage', async () => {
        openAiCreateMock.mockResolvedValue({
            choices: [
                {
                    message: {
                        content: JSON.stringify({
                            title: 'Diş Kliniği Hakkında',
                            content: 'Muayene sonrası plan ve fiyat paylaşılır.'
                        })
                    }
                }
            ],
            usage: {
                prompt_tokens: 120,
                completion_tokens: 80,
                total_tokens: 200
            }
        })

        const result = await generateKnowledgeBaseDraftFromBrief({
            organizationId: 'org-1',
            locale: 'tr',
            brief: {
                businessBasics: 'İstanbul’da implant ve ortodonti hizmeti veriyoruz.',
                processDetails: 'Önce muayene yapıyoruz, sonra plan çıkarıyoruz.',
                botGuidelines: 'Kesin fiyat vermesin.',
                extraNotes: 'Sakin ve net bir dil kullansın.'
            },
            supabase: {} as never
        })

        expect(result).toEqual({
            title: 'Diş Kliniği Hakkında',
            content: 'Muayene sonrası plan ve fiyat paylaşılır.'
        })
        expect(openAiCreateMock).toHaveBeenCalledTimes(1)
        expect(openAiCreateMock).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-4o-mini',
                response_format: { type: 'json_object' }
            })
        )
        expect(openAiCreateMock.mock.calls[0]?.[0]?.messages?.[1]?.content).toContain(
            'İstanbul’da implant ve ortodonti hizmeti veriyoruz.'
        )
        expect(recordAiUsageMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organizationId: 'org-1',
                category: 'lead_extraction',
                metadata: expect.objectContaining({
                    source: 'knowledge_ai_fill'
                })
            })
        )
    })
})
