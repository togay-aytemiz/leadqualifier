import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    buildFallbackResponseMock,
    decideKnowledgeBaseRouteMock,
    getSkillMock,
    getOrgAiSettingsMock,
    getRequiredIntakeFieldsMock,
    matchSkillsSafelyMock,
    resolveOrganizationUsageEntitlementMock
} = vi.hoisted(() => ({
    buildFallbackResponseMock: vi.fn(),
    decideKnowledgeBaseRouteMock: vi.fn(),
    getSkillMock: vi.fn(),
    getOrgAiSettingsMock: vi.fn(),
    getRequiredIntakeFieldsMock: vi.fn(),
    matchSkillsSafelyMock: vi.fn(),
    resolveOrganizationUsageEntitlementMock: vi.fn()
}))

vi.mock('@/lib/ai/fallback', () => ({
    buildFallbackResponse: buildFallbackResponseMock
}))

vi.mock('@/lib/ai/settings', () => ({
    getOrgAiSettings: getOrgAiSettingsMock
}))

vi.mock('@/lib/ai/followup', () => ({
    analyzeRequiredIntakeState: vi.fn(() => ({
        requestMode: 'lead_qualification',
        requiredFields: [],
        effectiveRequiredFields: [],
        collectedFields: [],
        blockedReaskFields: [],
        missingFields: [],
        dynamicMinimumCount: 0,
        isShortConversation: true,
        latestRefusal: false,
        noProgressStreak: false,
        suppressIntakeQuestions: false
    })),
    buildRequiredIntakeFollowupGuidance: vi.fn(() => null),
    getRequiredIntakeFields: getRequiredIntakeFieldsMock
}))

vi.mock('@/lib/billing/entitlements', () => ({
    resolveOrganizationUsageEntitlement: resolveOrganizationUsageEntitlementMock
}))

vi.mock('@/lib/knowledge-base/router', () => ({
    decideKnowledgeBaseRoute: decideKnowledgeBaseRouteMock
}))

vi.mock('@/lib/skills/actions', () => ({
    getSkill: getSkillMock,
    matchSkills: vi.fn()
}))

vi.mock('@/lib/skills/match-safe', () => ({
    matchSkillsSafely: matchSkillsSafelyMock
}))

import { simulateChat } from '@/lib/chat/actions'

describe('simulateChat', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        resolveOrganizationUsageEntitlementMock.mockResolvedValue({
            isUsageAllowed: true
        })
        getOrgAiSettingsMock.mockResolvedValue({
            prompt: 'Türkçe davranış talimatları',
            bot_name: 'Qualy',
            match_threshold: 0.75
        })
        getRequiredIntakeFieldsMock.mockResolvedValue([])
        getSkillMock.mockResolvedValue(null)
        matchSkillsSafelyMock.mockResolvedValue([])
        decideKnowledgeBaseRouteMock.mockResolvedValue({
            route_to_kb: false,
            usage: {
                inputTokens: 0,
                outputTokens: 0,
                totalTokens: 0
            }
        })
        buildFallbackResponseMock.mockResolvedValue('Simülatör cevabı')
    })

    it('loads organization AI settings with the resolved response language', async () => {
        await simulateChat('Merhaba, fiyat bilgisi alabilir miyim?', 'org-1')

        expect(getOrgAiSettingsMock).toHaveBeenCalledWith('org-1', {
            locale: 'tr'
        })
    })

    it('returns matched Skill text exactly without fallback generation', async () => {
        const skillResponse = 'Operatörün yazdığı net cevap.\nEk cümle yok.'
        matchSkillsSafelyMock.mockResolvedValueOnce([{
            skill_id: 'skill-1',
            title: 'Karşılama',
            similarity: 0.95,
            response_text: skillResponse
        }])
        getSkillMock.mockResolvedValueOnce({
            id: 'skill-1',
            title: 'Karşılama',
            image_public_url: null
        })

        const result = await simulateChat('Selam', 'org-1')

        expect(result.response).toBe(skillResponse)
        expect(decideKnowledgeBaseRouteMock).not.toHaveBeenCalled()
        expect(buildFallbackResponseMock).not.toHaveBeenCalled()
    })
})
