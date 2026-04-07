import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    revalidatePathMock,
    assertTenantWriteAllowedMock,
    resolveActiveOrganizationContextMock,
    generateKnowledgeBaseDraftFromBriefMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    assertTenantWriteAllowedMock: vi.fn(async () => {}),
    resolveActiveOrganizationContextMock: vi.fn(async () => ({ activeOrganizationId: 'org-1' })),
    generateKnowledgeBaseDraftFromBriefMock: vi.fn()
}))

vi.mock('@/lib/supabase/server', () => ({
    createClient: createClientMock
}))

vi.mock('next/cache', () => ({
    revalidatePath: revalidatePathMock
}))

vi.mock('@/lib/organizations/active-context', () => ({
    assertTenantWriteAllowed: assertTenantWriteAllowedMock,
    resolveActiveOrganizationContext: resolveActiveOrganizationContextMock
}))

vi.mock('@/lib/knowledge-base/ai-draft', () => ({
    generateKnowledgeBaseDraftFromBrief: generateKnowledgeBaseDraftFromBriefMock
}))

import { createKnowledgeBaseEntry, generateKnowledgeBaseDraft, getCollections } from '@/lib/knowledge-base/actions'

function createCollectionsSupabase() {
    const collectionsEqMock = vi.fn(async () => ({
        data: [
            {
                id: 'col-1',
                organization_id: 'org-1',
                name: 'FAQ',
                description: null,
                icon: 'folder',
                created_at: '2026-03-26T09:00:00.000Z'
            },
            {
                id: 'col-2',
                organization_id: 'org-1',
                name: 'Policies',
                description: null,
                icon: 'folder',
                created_at: '2026-03-26T09:30:00.000Z'
            }
        ],
        error: null
    }))
    const collectionsOrderMock = vi.fn(() => ({
        eq: collectionsEqMock
    }))
    const collectionsSelectMock = vi.fn(() => ({
        order: collectionsOrderMock
    }))
    const fromMock = vi.fn((table: string) => {
        if (table === 'knowledge_documents') {
            throw new Error('collection counts should use aggregated rpc, not document row scans')
        }

        if (table !== 'knowledge_collections') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: collectionsSelectMock
        }
    })
    const rpcMock = vi.fn(async () => ({
        data: [
            { collection_id: 'col-1', document_count: 3 },
            { collection_id: 'col-2', document_count: 1 }
        ],
        error: null
    }))

    return {
        supabase: {
            from: fromMock,
            rpc: rpcMock
        },
        fromMock,
        rpcMock
    }
}

function createKnowledgeCreateSupabase(existingCount: number) {
    const insertSingleMock = vi.fn(async () => ({
        data: {
            id: 'doc-1',
            organization_id: 'org-1',
            collection_id: 'col-1',
            title: 'İlk doküman',
            type: 'article',
            content: 'İçerik',
            source: 'manual',
            status: 'processing',
            created_at: '2026-04-01T09:00:00.000Z',
            updated_at: '2026-04-01T09:00:00.000Z'
        },
        error: null
    }))
    const insertSelectMock = vi.fn(() => ({
        single: insertSingleMock
    }))
    const insertMock = vi.fn(() => ({
        select: insertSelectMock
    }))

    const countEqMock = vi.fn(async () => ({
        count: existingCount,
        error: null
    }))
    const countSelectMock = vi.fn(() => ({
        eq: countEqMock
    }))

    const orgMemberSingleMock = vi.fn(async () => ({
        data: { organization_id: 'org-1' },
        error: null
    }))
    const orgMemberLimitMock = vi.fn(() => ({
        single: orgMemberSingleMock
    }))
    const orgMemberEqMock = vi.fn(() => ({
        limit: orgMemberLimitMock
    }))
    const orgMemberSelectMock = vi.fn(() => ({
        eq: orgMemberEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'knowledge_documents') {
            return {
                select: countSelectMock,
                insert: insertMock
            }
        }

        if (table === 'organization_members') {
            return {
                select: orgMemberSelectMock
            }
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            auth: {
                getUser: vi.fn(async () => ({
                    data: {
                        user: {
                            id: 'user-1'
                        }
                    }
                }))
            },
            from: fromMock
        },
        countSelectMock,
        countEqMock,
        insertMock,
        insertSingleMock
    }
}

function createKnowledgeDraftSupabase() {
    const orgMemberSingleMock = vi.fn(async () => ({
        data: { organization_id: 'org-1' },
        error: null
    }))
    const orgMemberLimitMock = vi.fn(() => ({
        single: orgMemberSingleMock
    }))
    const orgMemberEqMock = vi.fn(() => ({
        limit: orgMemberLimitMock
    }))
    const orgMemberSelectMock = vi.fn(() => ({
        eq: orgMemberEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'organization_members') {
            return {
                select: orgMemberSelectMock
            }
        }

        if (table === 'knowledge_documents') {
            throw new Error('draft generation should not write knowledge_documents')
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            auth: {
                getUser: vi.fn(async () => ({
                    data: {
                        user: {
                            id: 'user-1'
                        }
                    }
                }))
            },
            from: fromMock
        },
        fromMock
    }
}

describe('getCollections', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses aggregated collection counts instead of scanning knowledge_documents rows', async () => {
        const { supabase, fromMock, rpcMock } = createCollectionsSupabase()
        createClientMock.mockResolvedValue(supabase)

        const result = await getCollections('org-1')

        expect(rpcMock).toHaveBeenCalledWith('count_knowledge_documents_by_collection', {
            target_organization_id: 'org-1'
        })
        expect(fromMock).toHaveBeenCalledTimes(1)
        expect(result).toEqual([
            expect.objectContaining({ id: 'col-1', count: 3 }),
            expect.objectContaining({ id: 'col-2', count: 1 })
        ])
    })
})

describe('createKnowledgeBaseEntry', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('flags the first knowledge document so the UI can show onboarding guidance once', async () => {
        const { supabase, countEqMock, insertMock } = createKnowledgeCreateSupabase(0)
        createClientMock.mockResolvedValue(supabase)

        const result = await createKnowledgeBaseEntry({
            title: 'İlk doküman',
            content: 'İçerik',
            type: 'article',
            collection_id: 'col-1'
        })

        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(countEqMock).toHaveBeenCalledWith('organization_id', 'org-1')
        expect(insertMock).toHaveBeenCalledWith(
            expect.objectContaining({
                organization_id: 'org-1',
                source: 'manual',
                status: 'processing'
            })
        )
        expect(result).toEqual({
            document: expect.objectContaining({ id: 'doc-1', title: 'İlk doküman' }),
            showFirstDocumentGuidance: true
        })
        expect(revalidatePathMock).toHaveBeenCalledWith('/knowledge')
    })

    it('skips the first-document guidance after the first knowledge document exists', async () => {
        const { supabase } = createKnowledgeCreateSupabase(2)
        createClientMock.mockResolvedValue(supabase)

        const result = await createKnowledgeBaseEntry({
            title: 'İkinci doküman',
            content: 'İçerik',
            type: 'article',
            collection_id: null
        })

        expect(result).toEqual({
            document: expect.objectContaining({ id: 'doc-1' }),
            showFirstDocumentGuidance: false
        })
    })
})

describe('generateKnowledgeBaseDraft', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('delegates structured brief generation without touching knowledge_documents rows', async () => {
        const { supabase, fromMock } = createKnowledgeDraftSupabase()
        createClientMock.mockResolvedValue(supabase)
        generateKnowledgeBaseDraftFromBriefMock.mockResolvedValue({
            title: 'Tedavi Süreci',
            content: 'Önce muayene yapılır.'
        })

        const result = await generateKnowledgeBaseDraft({
            locale: 'tr',
            brief: {
                businessBasics: 'Diş kliniği',
                processDetails: 'Muayene ile başlar',
                botGuidelines: 'Kesin fiyat verme',
                extraNotes: ''
            }
        })

        expect(assertTenantWriteAllowedMock).toHaveBeenCalledWith(supabase)
        expect(generateKnowledgeBaseDraftFromBriefMock).toHaveBeenCalledWith({
            organizationId: 'org-1',
            locale: 'tr',
            brief: {
                businessBasics: 'Diş kliniği',
                processDetails: 'Muayene ile başlar',
                botGuidelines: 'Kesin fiyat verme',
                extraNotes: ''
            },
            supabase
        })
        expect(fromMock).not.toHaveBeenCalledWith('knowledge_documents')
        expect(result).toEqual({
            title: 'Tedavi Süreci',
            content: 'Önce muayene yapılır.'
        })
    })
})
