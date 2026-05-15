import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    appendOfferingProfileSuggestionMock,
    appendRequiredIntakeFieldsMock,
    appendServiceCatalogCandidatesMock,
    assertTenantWriteAllowedMock,
    buildDefaultSystemSkillsMock,
    createClientMock,
    formatEmbeddingForPgvectorMock,
    generateEmbeddingsMock,
    sanitizeSkillActionsMock,
    shouldRunSkillsMaintenanceForOrganizationMock
} = vi.hoisted(() => ({
    appendOfferingProfileSuggestionMock: vi.fn(),
    appendRequiredIntakeFieldsMock: vi.fn(),
    appendServiceCatalogCandidatesMock: vi.fn(),
    assertTenantWriteAllowedMock: vi.fn(),
    buildDefaultSystemSkillsMock: vi.fn(),
    createClientMock: vi.fn(),
    formatEmbeddingForPgvectorMock: vi.fn(),
    generateEmbeddingsMock: vi.fn(),
    sanitizeSkillActionsMock: vi.fn((value) => value),
    shouldRunSkillsMaintenanceForOrganizationMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbeddings: generateEmbeddingsMock,
    formatEmbeddingForPgvector: formatEmbeddingForPgvectorMock
}))

vi.mock('@/lib/skills/default-system-skills', () => ({
    buildDefaultSystemSkills: buildDefaultSystemSkillsMock
}))

vi.mock('@/lib/skills/maintenance-cache', () => ({
    shouldRunSkillsMaintenanceForOrganization: shouldRunSkillsMaintenanceForOrganizationMock
}))

vi.mock('@/lib/skills/skill-actions', () => ({
    sanitizeSkillActions: sanitizeSkillActionsMock
}))

vi.mock('@/lib/organizations/active-context', () => ({
    assertTenantWriteAllowed: assertTenantWriteAllowedMock
}))

vi.mock('@/lib/leads/offering-profile', () => ({
    appendServiceCatalogCandidates: appendServiceCatalogCandidatesMock,
    appendOfferingProfileSuggestion: appendOfferingProfileSuggestionMock,
    appendRequiredIntakeFields: appendRequiredIntakeFieldsMock
}))

import { getSkills, matchSkills } from '@/lib/skills/actions'

type SkillRow = {
    id: string
    organization_id: string
    title: string
    response_text: string
    trigger_examples: string[]
    created_at: string
}

function createSkillsReadSupabase(skills: SkillRow[]) {
    const orderMock = vi.fn(async () => ({
        data: skills,
        error: null
    }))
    const eqListMock = vi.fn(() => ({
        order: orderMock
    }))
    const eqCountMock = vi.fn(async () => ({
        count: skills.length,
        error: null
    }))
    const selectMock = vi.fn((columns: string, options?: { count?: string; head?: boolean }) => {
        if (columns === 'id' && options?.count === 'exact' && options?.head === true) {
            return {
                eq: eqCountMock
            }
        }

        return {
            eq: eqListMock
        }
    })
    const fromMock = vi.fn((table: string) => {
        if (table === 'skill_embeddings') {
            throw new Error('read path should not touch skill_embeddings')
        }

        if (table !== 'skills') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock
        }
    })

    return {
        supabase: {
            from: fromMock
        },
        fromMock,
        selectMock,
        eqListMock,
        eqCountMock,
        orderMock
    }
}

function createSkillExactMatchSupabase(skills: Array<Pick<SkillRow, 'id' | 'title' | 'response_text' | 'trigger_examples'>>) {
    const limitMock = vi.fn(async () => ({
        data: skills,
        error: null
    }))
    const eqEnabledMock = vi.fn(() => ({ limit: limitMock }))
    const eqOrgMock = vi.fn(() => ({ eq: eqEnabledMock }))
    const selectMock = vi.fn(() => ({ eq: eqOrgMock }))
    const rpcMock = vi.fn()
    const fromMock = vi.fn((table: string) => {
        if (table !== 'skills') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock
        }
    })

    return {
        supabase: {
            from: fromMock,
            rpc: rpcMock
        },
        fromMock,
        rpcMock
    }
}

describe('getSkills', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        shouldRunSkillsMaintenanceForOrganizationMock.mockReturnValue(false)
    })

    it('returns existing skills without extra maintenance work on the read path', async () => {
        const existingSkills: SkillRow[] = [
            {
                id: 'skill-1',
                organization_id: 'org-1',
                title: 'Pricing',
                response_text: 'Current prices',
                trigger_examples: ['price'],
                created_at: '2026-03-26T10:00:00.000Z'
            }
        ]
        const { supabase, fromMock } = createSkillsReadSupabase(existingSkills)
        createClientMock.mockResolvedValue(supabase)

        const result = await getSkills('org-1', '', 'tr')

        expect(result).toEqual(existingSkills)
        expect(fromMock).toHaveBeenCalledTimes(1)
        expect(fromMock).toHaveBeenCalledWith('skills')
    })

    it('does not touch embedding maintenance tables during a normal list read', async () => {
        const existingSkills: SkillRow[] = [
            {
                id: 'skill-2',
                organization_id: 'org-1',
                title: 'Hours',
                response_text: 'Working hours',
                trigger_examples: ['hours'],
                created_at: '2026-03-26T11:00:00.000Z'
            }
        ]
        const { supabase } = createSkillsReadSupabase(existingSkills)
        createClientMock.mockResolvedValue(supabase)
        shouldRunSkillsMaintenanceForOrganizationMock.mockReturnValue(true)

        await expect(getSkills('org-1', '', 'tr')).resolves.toEqual(existingSkills)
    })
})

describe('matchSkills', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('matches exact configurable trigger examples before embedding search for Telegram start commands', async () => {
        const { supabase, rpcMock } = createSkillExactMatchSupabase([
            {
                id: 'skill-greeting',
                title: 'Karşılama ve İlk Mesaj',
                response_text: 'Merhaba, yardımcı olayım. Hangi konuda bilgi almak istersiniz?',
                trigger_examples: ['/start', 'Merhaba', 'Selam']
            }
        ])

        const result = await matchSkills('/start payload', 'org-1', 0.7, 5, supabase as never)

        expect(result).toEqual([
            {
                skill_id: 'skill-greeting',
                title: 'Karşılama ve İlk Mesaj',
                response_text: 'Merhaba, yardımcı olayım. Hangi konuda bilgi almak istersiniz?',
                trigger_text: '/start',
                similarity: 1
            }
        ])
        expect(generateEmbeddingsMock).not.toHaveBeenCalled()
        expect(rpcMock).not.toHaveBeenCalled()
    })
})
