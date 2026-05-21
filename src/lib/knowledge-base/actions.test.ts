import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    createClientMock,
    revalidatePathMock,
    assertTenantWriteAllowedMock,
    resolveActiveOrganizationContextMock,
    generateKnowledgeBaseDraftFromBriefMock,
    generateEmbeddingMock,
    generateEmbeddingsMock,
    formatEmbeddingForPgvectorMock,
    appendServiceCatalogCandidatesMock,
    appendOfferingProfileSuggestionMock,
    appendRequiredIntakeFieldsMock
} = vi.hoisted(() => ({
    createClientMock: vi.fn(),
    revalidatePathMock: vi.fn(),
    assertTenantWriteAllowedMock: vi.fn(async () => {}),
    resolveActiveOrganizationContextMock: vi.fn(async () => ({ activeOrganizationId: 'org-1' })),
    generateKnowledgeBaseDraftFromBriefMock: vi.fn(),
    generateEmbeddingMock: vi.fn(async () => [0.1, 0.2, 0.3]),
    generateEmbeddingsMock: vi.fn(async () => [[0.1, 0.2, 0.3]]),
    formatEmbeddingForPgvectorMock: vi.fn(() => '[0.1,0.2,0.3]'),
    appendServiceCatalogCandidatesMock: vi.fn(async () => {}),
    appendOfferingProfileSuggestionMock: vi.fn(async () => {}),
    appendRequiredIntakeFieldsMock: vi.fn(async () => {})
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

vi.mock('@/lib/ai/embeddings', () => ({
    generateEmbedding: generateEmbeddingMock,
    generateEmbeddings: generateEmbeddingsMock,
    formatEmbeddingForPgvector: formatEmbeddingForPgvectorMock
}))

vi.mock('@/lib/leads/offering-profile', () => ({
    appendServiceCatalogCandidates: appendServiceCatalogCandidatesMock,
    appendOfferingProfileSuggestion: appendOfferingProfileSuggestionMock,
    appendRequiredIntakeFields: appendRequiredIntakeFieldsMock
}))

import {
    createKnowledgeBaseEntry,
    generateKnowledgeBaseDraft,
    getCollections,
    getKnowledgeBaseEntriesPage,
    getSidebarData,
    getSidebarFilesPage,
    processKnowledgeDocument,
    searchKnowledgeBase
} from '@/lib/knowledge-base/actions'

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

function createKnowledgeEntriesPageSupabase() {
    const rangeMock = vi.fn(async () => ({
        data: [
            {
                id: 'doc-51',
                organization_id: 'org-1',
                collection_id: 'col-1',
                title: 'Page 51',
                type: 'article',
                content: 'Page content',
                status: 'ready',
                created_at: '2026-05-19T10:00:00.000Z',
                updated_at: '2026-05-19T10:00:00.000Z',
                collection: {
                    id: 'col-1',
                    organization_id: 'org-1',
                    name: 'Website Crawl',
                    description: null,
                    icon: 'folder',
                    created_at: '2026-05-19T09:00:00.000Z'
                }
            }
        ],
        count: 1240,
        error: null
    }))
    const queryChain: {
        order: ReturnType<typeof vi.fn>
        eq: ReturnType<typeof vi.fn>
        range: ReturnType<typeof vi.fn>
    } = {
        order: vi.fn(),
        eq: vi.fn(),
        range: rangeMock
    }
    queryChain.order.mockReturnValue(queryChain)
    queryChain.eq.mockReturnValue(queryChain)

    const selectMock = vi.fn(() => queryChain)
    const fromMock = vi.fn((table: string) => {
        if (table !== 'knowledge_documents') {
            throw new Error(`Unexpected table ${table}`)
        }

        return { select: selectMock }
    })

    return {
        supabase: {
            from: fromMock
        },
        selectMock,
        rangeMock,
        eqMock: queryChain.eq
    }
}

function createSidebarSummarySupabase() {
    const collectionsEqMock = vi.fn(async () => ({
        data: [
            {
                id: 'col-1',
                organization_id: 'org-1',
                name: 'Website Crawl',
                description: null,
                icon: 'folder',
                created_at: '2026-05-19T09:00:00.000Z'
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

    const totalEqMock = vi.fn(async () => ({
        count: 1250,
        error: null
    }))
    const uncategorizedRangeMock = vi.fn(async () => ({
        data: [
            {
                id: 'root-1',
                title: 'Root document',
                type: 'article',
                collection_id: null
            }
        ],
        count: 1,
        error: null
    }))
    const uncategorizedChain: {
        eq: ReturnType<typeof vi.fn>
        is: ReturnType<typeof vi.fn>
        order: ReturnType<typeof vi.fn>
        range: ReturnType<typeof vi.fn>
    } = {
        eq: vi.fn(),
        is: vi.fn(),
        order: vi.fn(),
        range: uncategorizedRangeMock
    }
    uncategorizedChain.eq.mockReturnValue(uncategorizedChain)
    uncategorizedChain.is.mockReturnValue(uncategorizedChain)
    uncategorizedChain.order.mockReturnValue(uncategorizedChain)

    const documentsSelectMock = vi.fn((_selection: string, options?: { count?: string; head?: boolean }) => {
        if (options?.head) return { eq: totalEqMock }
        return uncategorizedChain
    })

    const fromMock = vi.fn((table: string) => {
        if (table === 'knowledge_collections') {
            return { select: collectionsSelectMock }
        }
        if (table === 'knowledge_documents') {
            return { select: documentsSelectMock }
        }
        throw new Error(`Unexpected table ${table}`)
    })
    const rpcMock = vi.fn(async () => ({
        data: [
            { collection_id: 'col-1', document_count: 1240 }
        ],
        error: null
    }))

    return {
        supabase: {
            from: fromMock,
            rpc: rpcMock
        },
        documentsSelectMock,
        uncategorizedRangeMock
    }
}

function createSidebarFilesPageSupabase() {
    const rangeMock = vi.fn(async () => ({
        data: [
            {
                id: 'doc-26',
                title: 'Loaded document',
                type: 'article',
                collection_id: 'col-1'
            }
        ],
        count: 1240,
        error: null
    }))
    const queryChain: {
        eq: ReturnType<typeof vi.fn>
        is: ReturnType<typeof vi.fn>
        order: ReturnType<typeof vi.fn>
        range: ReturnType<typeof vi.fn>
    } = {
        eq: vi.fn(),
        is: vi.fn(),
        order: vi.fn(),
        range: rangeMock
    }
    queryChain.eq.mockReturnValue(queryChain)
    queryChain.is.mockReturnValue(queryChain)
    queryChain.order.mockReturnValue(queryChain)

    const selectMock = vi.fn(() => queryChain)
    const fromMock = vi.fn((table: string) => {
        if (table !== 'knowledge_documents') {
            throw new Error(`Unexpected table ${table}`)
        }
        return { select: selectMock }
    })

    return {
        supabase: {
            from: fromMock
        },
        selectMock,
        rangeMock,
        eqMock: queryChain.eq
    }
}

function createHybridSearchSupabase(options?: {
    rpcRows?: Array<{
        chunk_id: string
        document_id: string
        document_title: string
        document_type: string
        content: string
        similarity: number
    }>
    fallbackRows?: Array<{
        id: string
        document_id: string
        content: string
        knowledge_documents: {
            title: string
            type: string
            status: string
            collection_id?: string | null
            language?: string | null
        }
    }>
    fallbackRowPages?: Array<Array<{
        id: string
        document_id: string
        content: string
        knowledge_documents: {
            title: string
            type: string
            status: string
            collection_id?: string | null
            language?: string | null
        }
    }>>
    titleRows?: Array<{
        id: string
        title: string
        type: string
        status: string
    }>
    titleChunkRows?: Array<{
        id: string
        document_id: string
        chunk_index: number
        content: string
        knowledge_documents: {
            title: string
            type: string
            status: string
            collection_id?: string | null
            language?: string | null
        }
    }>
}) {
    const rpcMock = vi.fn(async () => ({
        data: options?.rpcRows ?? [
            {
                chunk_id: 'vec-1',
                document_id: 'doc-vec-1',
                document_title: 'Tıp Fakültesi Formlar',
                document_type: 'article',
                content: 'Tıp Fakültesi formları ve dilekçeleri.',
                similarity: 0.57
            },
            {
                chunk_id: 'vec-2',
                document_id: 'doc-vec-2',
                document_title: 'Tıp Fakültesi',
                document_type: 'article',
                content: 'Tıp Fakültesi genel bilgiler.',
                similarity: 0.55
            }
        ],
        error: null
    }))

    const fallbackRows = options?.fallbackRows ?? [
        {
            id: 'kw-1',
            document_id: 'doc-kw-1',
            content: 'Page Title: Boards\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/fakulte-hakkinda/kurullar\n\nBoard of Coordinators and Faculty of Medicine boards.',
            knowledge_documents: {
                title: 'Boards',
                type: 'article',
                status: 'ready'
            }
        }
    ]

    const titleRows = options?.titleRows ?? []
    const titleChunkRows = options?.titleChunkRows ?? []
    const fallbackRowPages = options?.fallbackRowPages ?? [fallbackRows]
    let fallbackLimitCallCount = 0

    const limitMock = vi.fn(async () => ({
        data: fallbackRowPages[Math.min(fallbackLimitCallCount++, fallbackRowPages.length - 1)] ?? [],
        error: null
    }))
    const keywordChain: {
        eq: ReturnType<typeof vi.fn>
        or: ReturnType<typeof vi.fn>
        limit: ReturnType<typeof vi.fn>
    } = {
        eq: vi.fn(),
        or: vi.fn(),
        limit: limitMock
    }
    keywordChain.eq.mockReturnValue(keywordChain)
    keywordChain.or.mockReturnValue(keywordChain)

    const titleDocumentLimitMock = vi.fn(async () => ({
        data: titleRows,
        error: null
    }))
    const titleDocumentChain: {
        eq: ReturnType<typeof vi.fn>
        or: ReturnType<typeof vi.fn>
    } = {
        eq: vi.fn(),
        or: vi.fn(() => ({
            limit: titleDocumentLimitMock
        }))
    }
    titleDocumentChain.eq.mockReturnValue(titleDocumentChain)

    const titleChunkLimitMock = vi.fn(async () => ({
        data: titleChunkRows,
        error: null
    }))
    const titleChunkOrderMock = vi.fn(() => ({
        limit: titleChunkLimitMock
    }))
    const titleChunkChain: {
        eq: ReturnType<typeof vi.fn>
        in: ReturnType<typeof vi.fn>
        order: ReturnType<typeof vi.fn>
    } = {
        eq: vi.fn(),
        in: vi.fn(),
        order: titleChunkOrderMock
    }
    titleChunkChain.eq.mockReturnValue(titleChunkChain)
    titleChunkChain.in.mockReturnValue(titleChunkChain)

    const knowledgeChunksSelectMock = vi.fn((selection: string) => {
        if (selection.includes('chunk_index')) {
            return titleChunkChain
        }

        return keywordChain
    })
    const knowledgeDocumentsSelectMock = vi.fn(() => titleDocumentChain)
    const fromMock = vi.fn((table: string) => {
        if (table === 'knowledge_chunks') {
            return {
                select: knowledgeChunksSelectMock
            }
        }

        if (table === 'knowledge_documents') {
            return {
                select: knowledgeDocumentsSelectMock
            }
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            rpc: rpcMock,
            from: fromMock
        },
        rpcMock,
        orMock: keywordChain.or,
        limitMock,
        titleDocumentOrMock: titleDocumentChain.or,
        titleDocumentLimitMock,
        titleChunkLimitMock
    }
}

function createProcessKnowledgeDocumentSupabase() {
    const documentSingleMock = vi.fn(async () => ({
        data: {
            id: 'doc-1',
            organization_id: 'org-1',
            title: 'Tıp Fakültesi Kurulları',
            content: 'Board of Coordinators\nProf. Dr. Ayla KURKCUOGLU'
        },
        error: null
    }))
    const documentEqMock = vi.fn(() => ({
        single: documentSingleMock
    }))
    const documentSelectMock = vi.fn(() => ({
        eq: documentEqMock
    }))

    const deleteEqMock = vi.fn(async () => ({ error: null }))
    const deleteMock = vi.fn(() => ({
        eq: deleteEqMock
    }))
    const insertMock = vi.fn(async () => ({ error: null }))

    const readySingleMock = vi.fn(async () => ({
        data: {
            id: 'doc-1',
            organization_id: 'org-1',
            title: 'Tıp Fakültesi Kurulları',
            content: 'Board of Coordinators\nProf. Dr. Ayla KURKCUOGLU',
            status: 'ready'
        },
        error: null
    }))
    const readySelectMock = vi.fn(() => ({
        single: readySingleMock
    }))
    const readyEqMock = vi.fn(() => ({
        select: readySelectMock
    }))
    const updateMock = vi.fn(() => ({
        eq: readyEqMock
    }))

    const fromMock = vi.fn((table: string) => {
        if (table === 'knowledge_documents') {
            return {
                select: documentSelectMock,
                update: updateMock
            }
        }

        if (table === 'knowledge_chunks') {
            return {
                delete: deleteMock,
                insert: insertMock
            }
        }

        throw new Error(`Unexpected table ${table}`)
    })

    return {
        supabase: {
            from: fromMock
        },
        insertMock
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

describe('Knowledge Base paginated list actions', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('loads a bounded document page with exact total count instead of relying on the Supabase default row cap', async () => {
        const { supabase, selectMock, rangeMock, eqMock } = createKnowledgeEntriesPageSupabase()
        createClientMock.mockResolvedValue(supabase)

        const result = await getKnowledgeBaseEntriesPage({
            collectionId: 'col-1',
            organizationId: 'org-1',
            offset: 50,
            limit: 25
        })

        expect(selectMock).toHaveBeenCalledWith(expect.stringContaining('collection:knowledge_collections(*)'), { count: 'exact' })
        expect(eqMock).toHaveBeenCalledWith('organization_id', 'org-1')
        expect(eqMock).toHaveBeenCalledWith('collection_id', 'col-1')
        expect(rangeMock).toHaveBeenCalledWith(50, 74)
        expect(result).toMatchObject({
            entries: [expect.objectContaining({ id: 'doc-51', collection: expect.objectContaining({ id: 'col-1' }) })],
            totalCount: 1240,
            nextOffset: 51,
            hasMore: true
        })
        expect(result.pageSize).toBe(25)
    })

    it('keeps sidebar summary lightweight and does not load every document into every folder on first paint', async () => {
        const { supabase, documentsSelectMock, uncategorizedRangeMock } = createSidebarSummarySupabase()
        createClientMock.mockResolvedValue(supabase)

        const result = await getSidebarData('org-1')

        expect(documentsSelectMock).toHaveBeenCalledWith('id', { count: 'exact', head: true })
        expect(uncategorizedRangeMock).toHaveBeenCalledWith(0, 24)
        expect(result).toEqual({
            collections: [
                expect.objectContaining({
                    id: 'col-1',
                    count: 1240,
                    files: [],
                    loadedFileCount: 0,
                    hasMoreFiles: true
                })
            ],
            uncategorized: [expect.objectContaining({ id: 'root-1' })],
            uncategorizedCount: 1,
            uncategorizedHasMore: false,
            totalCount: 1250
        })
    })

    it('loads sidebar folder files in explicit pages when a folder is expanded', async () => {
        const { supabase, selectMock, rangeMock, eqMock } = createSidebarFilesPageSupabase()
        createClientMock.mockResolvedValue(supabase)

        const result = await getSidebarFilesPage({
            collectionId: 'col-1',
            organizationId: 'org-1',
            offset: 25,
            limit: 25
        })

        expect(selectMock).toHaveBeenCalledWith('id, title, type, collection_id', { count: 'exact' })
        expect(eqMock).toHaveBeenCalledWith('organization_id', 'org-1')
        expect(eqMock).toHaveBeenCalledWith('collection_id', 'col-1')
        expect(rangeMock).toHaveBeenCalledWith(25, 49)
        expect(result).toMatchObject({
            files: [expect.objectContaining({ id: 'doc-26' })],
            totalCount: 1240,
            nextOffset: 26,
            hasMore: true
        })
        expect(result.pageSize).toBe(25)
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

describe('searchKnowledgeBase', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('merges vector and keyword matches so title or URL-specific pages are not hidden by broad semantic results', async () => {
        const { supabase, rpcMock, orMock, limitMock } = createHybridSearchSupabase()

        const results = await searchKnowledgeBase(
            'Tıp Fakültesi kurulları kimlerden oluşuyor?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(rpcMock).toHaveBeenCalledWith('match_knowledge_chunks', expect.objectContaining({
            match_count: expect.any(Number),
            filter_org_id: 'org-1'
        }))
        expect(orMock).toHaveBeenCalled()
        expect(orMock.mock.calls[0]?.[0]).toContain('tip')
        expect(orMock.mock.calls[0]?.[0]).toContain('kurullar')
        expect(limitMock).toHaveBeenCalledWith(40)
        expect(results[0]).toMatchObject({
            chunk_id: 'kw-1',
            document_id: 'doc-kw-1'
        })
        expect(results.map((result) => result.chunk_id)).toEqual(['kw-1', 'vec-1', 'vec-2'])
    })

    it('prefers evergreen department pages over announcements for generic department information questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'duyuru-1',
                    document_id: 'doc-duyuru-1',
                    document_title: 'Hemşirelik Bölümü Ön Değerlendirme Sonucu',
                    document_type: 'article',
                    content: 'Page Title: Hemşirelik Bölümü Ön Değerlendirme Sonucu\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/duyuru/hemsirelik-bolumu-on-degerlendirme-sonucu\n\nHemşirelik bölümü ön değerlendirme sonucu.',
                    similarity: 0.62
                },
                {
                    chunk_id: 'sayfa-1',
                    document_id: 'doc-sayfa-1',
                    document_title: 'DEPARTMENT OF NURSING',
                    document_type: 'article',
                    content: 'Page Title: DEPARTMENT OF NURSING\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/hemsirelik-bolumu\n\nHemşirelik bölümü hakkında genel bilgiler.',
                    similarity: 0.6
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Hemşirelik bölümü bilgilerini bulabilir misin?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('sayfa-1')
    })

    it('boosts direct contact pages for contact and address questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'faculty-1',
                    document_id: 'doc-faculty-1',
                    document_title: 'Spor Bilimleri Fakültesi',
                    document_type: 'article',
                    content: 'Page Title: Spor Bilimleri Fakültesi\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi\n\nSpor Bilimleri Fakültesi iletişim bilgileri.',
                    similarity: 0.64
                },
                {
                    chunk_id: 'contact-1',
                    document_id: 'doc-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi/iletisim\n\nSpor Bilimleri Fakültesi iletişim ve ulaşım bilgileri.',
                    similarity: 0.62
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Spor Bilimleri Fakültesi iletişim bilgileri nerede?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('contact-1')
    })

    it('prefers the root contact page for rectorate-wide phone questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'faculty-quality-contact-1',
                    document_id: 'doc-faculty-quality-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/kalite/paydas-katilimi-ve-iletisim/iletisim\n\nTıp Fakültesi telefon numarası +90 312 329 10 10.',
                    similarity: 0.66
                },
                {
                    chunk_id: 'root-contact-1',
                    document_id: 'doc-root-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/iletisim\n\nRektörlük ve Tıp Fakültesi telefon numarası 444 9 844.',
                    similarity: 0.58
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'İletişim sayfasında Rektörlük ve Tıp Fakültesi telefon numarası nedir?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('root-contact-1')
    })

    it('prefers the root contact page for general university phone and address questions', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'institute-contact-1',
                    document_id: 'doc-institute-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/enstituler/lisansustu-egitim-enstitusu/iletisim\n\nLisansüstü Eğitim Enstitüsü iletişim ve ulaşım bilgileri.',
                    similarity: 0.66
                },
                {
                    chunk_id: 'root-contact-1',
                    document_id: 'doc-root-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/iletisim\n\nBize Ulaşın. Rektörlük ve Tıp Fakültesi adres ve telefon bilgileri.',
                    similarity: 0.58
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Üniversitenin iletişim telefonunu ve adresini öğrenebilir miyim?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('root-contact-1')
        expect(orMock.mock.calls.some((call) => call[0].includes('/iletisim'))).toBe(true)
    })

    it('prefers the root contact table when a named administrative unit contact is asked', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'director-page-1',
                    document_id: 'doc-director-page-1',
                    document_title: 'Yazı İşleri Müdürlüğü',
                    document_type: 'article',
                    content: 'Page Title: Yazı İşleri Müdürlüğü\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/idari-birimler/mudurlukler/yazi-isleri-mudurlugu\n\nYazı İşleri Müdürü Furkan GÜNDOĞDU. E-posta furkan.gundogdu@yuksekihtisas.edu.tr.',
                    similarity: 0.66
                },
                {
                    chunk_id: 'root-contact-yazi-1',
                    document_id: 'doc-root-contact-yazi-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/iletisim\n\nYazı İşleri Müdürlüğü iletişim bilgileri. Dahili 201. E-posta yaziisleri@yuksekihtisas.edu.tr.',
                    similarity: 0.56
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Yazı İşleri Müdürlüğü iletişim bilgisi nedir?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('root-contact-yazi-1')
    })

    it('prefers the root contact table for named faculty secretariat contact questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'faculty-page-1',
                    document_id: 'doc-faculty-page-1',
                    document_title: 'Tıp Fakültesi',
                    document_type: 'article',
                    content: 'Page Title: Tıp Fakültesi\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi\n\nTıp Fakültesi genel tanıtım ve akademik bilgiler.',
                    similarity: 0.66
                },
                {
                    chunk_id: 'root-contact-tip-1',
                    document_id: 'doc-root-contact-tip-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/iletisim\n\nTıp Fakültesi Sekreterliği iletişim bilgileri. Dahili 261. E-posta tipfakultesi@yuksekihtisas.edu.tr.',
                    similarity: 0.54
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp Fakültesi Sekreterliği iletişim bilgisi nedir?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('root-contact-tip-1')
    })

    it('prefers the official occupational health coordinator page for natural İSG coordinator questions', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-coordinator-pdf-1',
                    document_id: 'doc-generic-coordinator-pdf-1',
                    document_title: 'Koordinatör Görev, Yetki ve Sorumluluklar',
                    document_type: 'article',
                    content: 'Page Title: Koordinatör Görev, Yetki ve Sorumluluklar\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/Uploads/idari_birim_alt_kategorileri_view/icerik_yonetimi_view/8f2e37363388791b73323b3662a1e6bb.pdf\n\nKoordinatör görev, yetki ve sorumlulukları.',
                    similarity: 0.64
                },
                {
                    chunk_id: 'isg-page-1',
                    document_id: 'doc-isg-page-1',
                    document_title: 'İş Sağlığı ve Güvenliği Koordinatörlüğü',
                    document_type: 'article',
                    content: 'Page Title: İş Sağlığı ve Güvenliği Koordinatörlüğü\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/idari-birimler/koordinatorlukler/is-sagligi-ve-guvenligi-koordinatorlugu\n\nİSG Koordinatörü Doç. Dr. Elanur DİKİCİOĞLU.',
                    similarity: 0.52
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'İSG koordinatörü kim olarak görünüyor?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('isg-page-1')
        expect(orMock.mock.calls.some((call) => call[0].includes('is-sagligi-ve-guvenligi-koordinatorlugu'))).toBe(true)
    })

    it('matches Turkish suffix variants in URL slugs for specific evergreen pages', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'general-1',
                    document_id: 'doc-general-1',
                    document_title: 'Tıp Fakültesi',
                    document_type: 'article',
                    content: 'Page Title: Tıp Fakültesi\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi\n\nTıp Fakültesi genel bilgiler.',
                    similarity: 0.56
                },
                {
                    chunk_id: 'history-1',
                    document_id: 'doc-history-1',
                    document_title: 'Tarihçemiz',
                    document_type: 'article',
                    content: 'Page Title: Tarihçemiz\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/fakulte-hakkinda/tarihcemiz\n\nTıp Fakültesi tarihçemiz.',
                    similarity: 0.5
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp Fakültesi tarihçesini nereden okuyabilirim?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('history-1')
    })

    it('ignores generic existence words so direct dormitory pages can win', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-1',
                    document_id: 'doc-generic-1',
                    document_title: 'Akademik Teşvik Düzenleme Komisyonu',
                    document_type: 'article',
                    content: 'Page Title: Akademik Teşvik Düzenleme Komisyonu\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/kurullar-ve-komisyonlar/akademik-tesvik-duzenleme-denetleme-ve-itiraz-komisyonu\n\nKomisyonun görevleri vardır.',
                    similarity: 0.56
                },
                {
                    chunk_id: 'dorm-1',
                    document_id: 'doc-dorm-1',
                    document_title: 'Yurtlar',
                    document_type: 'article',
                    content: 'Page Title: Yurtlar\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar\n\nÜniversite yurtları hakkında bilgiler.',
                    similarity: 0.5
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Üniversitenin yurtlar sayfası var mı?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(orMock.mock.calls[0]?.[0]).toContain('yurt')
        expect(orMock.mock.calls[0]?.[0]).not.toContain('var')
        expect(results[0]?.chunk_id).toBe('dorm-1')
    })

    it('ignores about-style filler words so dormitory pages beat unrelated abroad notices', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'abroad-1',
                    document_id: 'doc-abroad-1',
                    document_title: 'Öğrencilerin Yurt Dışına Çıkmaları Hakkında',
                    document_type: 'article',
                    content: 'Page Title: Öğrencilerin Yurt Dışına Çıkmaları Hakkında\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/duyuru/ogrencilerin-yurt-disina-cikmalari-hakkinda\n\nÖğrencilerin yurt dışına çıkmaları hakkında duyuru.',
                    similarity: 0.58
                },
                {
                    chunk_id: 'dorm-1',
                    document_id: 'doc-dorm-1',
                    document_title: 'Yurtlar',
                    document_type: 'article',
                    content: 'Page Title: Yurtlar\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/yurtlar/yurtlar/yurtlar\n\nAnlaşmalı yurtlar ve yurt protokol listesi.',
                    similarity: 0.5
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Üniversitenin yurtları hakkında bilgi var mı?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(orMock.mock.calls[0]?.[0]).toContain('yurt')
        expect(orMock.mock.calls[0]?.[0]).not.toContain('hakk')
        expect(results[0]?.chunk_id).toBe('dorm-1')
    })

    it('prefers the main academic calendar page for generic calendar link requests', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'faculty-calendar-1',
                    document_id: 'doc-faculty-calendar-1',
                    document_title: 'Akademik Takvim',
                    document_type: 'article',
                    content: 'Page Title: Akademik Takvim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/spor-bilimleri-fakultesi/akademik-takvim\n\nSpor Bilimleri Fakültesi akademik takvim.',
                    similarity: 0.62
                },
                {
                    chunk_id: 'main-calendar-1',
                    document_id: 'doc-main-calendar-1',
                    document_title: 'Academic Calendars',
                    document_type: 'article',
                    content: 'Page Title: Academic Calendars\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/akademik-takvim\n\n2025-2026 Eğitim Öğretim Yılı Akademik Takvimi.',
                    similarity: 0.58
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Akademik takvim sayfası nerede?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('main-calendar-1')
    })

    it('returns source_url metadata extracted from chunk content for downstream source-link formatting', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'source-1',
                    document_id: 'doc-source-1',
                    document_title: 'Akademik Takvim',
                    document_type: 'article',
                    content: 'Page Title: Akademik Takvim\nSource URL: https://example.edu.tr/akademik-takvim\n\nAkademik takvim bilgisi.',
                    similarity: 0.62
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Akademik takvim linki nedir?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'source-1',
            source_url: 'https://example.edu.tr/akademik-takvim'
        })
    })

    it('prefers the exact PDF title over a similarly named document when asking for a document number', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'similar-title-1',
                    document_id: 'doc-similar-title-1',
                    document_title: 'Tıp Fakültesi Eğitim Öğretim Ve Sınav Uygulamaları Yönergesi',
                    document_type: 'article',
                    content: 'Document Title: Tıp Fakültesi Eğitim Öğretim Ve Sınav Uygulamaları Yönergesi\nSource URL: https://example.edu.tr/uygulamalari.pdf\n\nDoküman No TIP.YNG.0018',
                    similarity: 0.72
                },
                {
                    chunk_id: 'exact-title-1',
                    document_id: 'doc-exact-title-1',
                    document_title: 'Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi',
                    document_type: 'article',
                    content: 'Document Title: Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi\nSource URL: https://example.edu.tr/sinav.pdf\n\nDoküman No TIP.YNG.0013',
                    similarity: 0.64
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesinin doküman numarası nedir?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('exact-title-1')
    })

    it('prefers a full regulation title over a short partial title for ethics regulation questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'short-title-1',
                    document_id: 'doc-short-title-1',
                    document_title: 'Yayın Yönergesi',
                    document_type: 'article',
                    content: 'Document Title: Yayın Yönergesi\nSource URL: https://example.edu.tr/yayin.pdf\n\nBu yönergenin amacı; Yayın Komisyonu tarafından uygun görülen yayınların planlanmasına ve yayımlanmasına ilişkin usul ve esasları düzenlemektir.',
                    similarity: 0.72
                },
                {
                    chunk_id: 'full-title-1',
                    document_id: 'doc-full-title-1',
                    document_title: 'Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi',
                    document_type: 'article',
                    content: 'Document Title: Yükseköğretim Kurumları Bilimsel Araştırma ve Yayın Etiği Yönergesi\nSource URL: https://example.edu.tr/bilimsel-arastirma-yayin-etigi.pdf\n\nAmaç Madde 1 - Bu Yönerge, bilimsel araştırma, çalışma, yayın ve etkinliklerde uyulması gereken etik kurallarını ve bilimsel araştırma ve yayın etiği kurullarının görev, yetki ve sorumluluklarını düzenler.',
                    similarity: 0.64
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Bilimsel Araştırma ve Yayın Etiği Yönergesinin amacı nedir?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('full-title-1')
    })

    it('does not let generic contact pages outrank a named coordinator page', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'main-contact-1',
                    document_id: 'doc-main-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/iletisim\n\nGenel iletişim adres ve telefon bilgileri.',
                    similarity: 0.62
                },
                {
                    chunk_id: 'international-1',
                    document_id: 'doc-international-1',
                    document_title: 'Uluslararası Öğrenci Koordinatörlüğü',
                    document_type: 'article',
                    content: 'Page Title: Uluslararası Öğrenci Koordinatörlüğü\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/kurumsal/idari-birimler/koordinatorlukler/uluslararasi-ogrenci-koordinatorlugu\n\nUluslararası öğrenci koordinatörlüğü iletişim bilgileri.',
                    similarity: 0.6
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Uluslararası öğrenci koordinatörlüğü iletişim bilgileri var mı?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('international-1')
    })

    it('boosts exact academic staff pages over parent or administrative staff pages', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'parent-1',
                    document_id: 'doc-parent-1',
                    document_title: 'Yabancı Diller Yüksekokulu',
                    document_type: 'article',
                    content: 'Page Title: Yabancı Diller Yüksekokulu\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/yabanci-diller-yuksekokulu\n\nYabancı Diller Yüksekokulu genel bilgiler.',
                    similarity: 0.62
                },
                {
                    chunk_id: 'admin-staff-1',
                    document_id: 'doc-admin-staff-1',
                    document_title: 'Administrative Staff',
                    document_type: 'article',
                    content: 'Page Title: Administrative Staff\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/yabanci-diller-yuksekokulu/idari-kadro\n\nİdari kadro listesi.',
                    similarity: 0.6
                },
                {
                    chunk_id: 'academic-staff-1',
                    document_id: 'doc-academic-staff-1',
                    document_title: 'Academic Staff',
                    document_type: 'article',
                    content: 'Page Title: Academic Staff\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/yabanci-diller-yuksekokulu/akademik-kadro\n\nAkademik kadro listesi.',
                    similarity: 0.58
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Yabancı Diller Yüksekokulu akademik kadro kimlerden oluşuyor?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('academic-staff-1')
    })

    it('adds title-matched early chunks for exact regulation metadata questions', async () => {
        const { supabase, titleDocumentOrMock, titleDocumentLimitMock, titleChunkLimitMock } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-regulation-1',
                    document_id: 'doc-generic-regulation-1',
                    document_title: 'Tıp Fakültesi Mevzuatlar',
                    document_type: 'article',
                    content: 'Page Title: Tıp Fakültesi Mevzuatlar\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi/mevzuatlar\n\nMevzuat listesi.',
                    similarity: 0.64
                }
            ],
            fallbackRows: [],
            titleRows: [
                {
                    id: 'doc-title-1',
                    title: 'Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi',
                    type: 'article',
                    status: 'ready'
                }
            ],
            titleChunkRows: [
                {
                    id: 'title-chunk-1',
                    document_id: 'doc-title-1',
                    chunk_index: 0,
                    content: 'Document Title: Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi\n\nKabul: 05.11.2025 tarihli ve 22 sayılı Senato’da 2025/122 sayılı karar ile kabul edilmiştir.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim- Öğretim Ve Sınav Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }
            ]
        })

        const results = await searchKnowledgeBase(
            'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi hangi Senato kararıyla kabul edildi?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(titleDocumentOrMock).toHaveBeenCalled()
        expect(titleDocumentLimitMock).toHaveBeenCalledWith(500)
        expect(titleChunkLimitMock).toHaveBeenCalled()
        expect(results[0]).toMatchObject({
            chunk_id: 'title-chunk-1',
            document_id: 'doc-title-1'
        })
        expect(results[0]?.content).toContain('2025/122')
    })

    it('prefers the canonical candidate student page when the user asks for the candidate student page', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'fees-1',
                    document_id: 'doc-fees-1',
                    document_title: 'Kayıt İşlemleri ve Ücretler',
                    document_type: 'article',
                    content: 'Page Title: Kayıt İşlemleri ve Ücretler\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/ogrenci/genel/kayit-islemleri-ve-ucretler\n\nKayıtlı öğrencilerin eğitim ücretleri.',
                    similarity: 0.64
                },
                {
                    chunk_id: 'candidate-1',
                    document_id: 'doc-candidate-1',
                    document_title: 'Tıp Puanları. Ankara Tıp Fakültesi ve Ankara\'da Tıp Bölümleri',
                    document_type: 'article',
                    content: 'Page Title: Tıp Puanları. Ankara Tıp Fakültesi ve Ankara\'da Tıp Bölümleri\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/aday-ogrenci\n\nÜCRETLER & BURSLAR\nKONTENJANLAR',
                    similarity: 0.5
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Aday öğrenci sayfasında ücretler, burslar ve kontenjanlar için ne var?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('candidate-1')
    })

    it('prefers evergreen department pages over old hiring notices for department page questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'notice-1',
                    document_id: 'doc-notice-1',
                    document_title: 'Beslenme ve Diyetetik Bölümü Öğretim Görevlisi Alımı Sınav Sonucu',
                    document_type: 'article',
                    content: 'Page Title: Beslenme ve Diyetetik Bölümü Öğretim Görevlisi Alımı Sınav Sonucu\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/duyuru/beslenme-ve-diyetetik-bolumu-ogretim-gorevlisi-alimi-sinav-sonucu\n\nBeslenme ve Diyetetik Bölümü öğretim görevlisi alımı sınav sonucu.',
                    similarity: 0.62
                },
                {
                    chunk_id: 'department-1',
                    document_id: 'doc-department-1',
                    document_title: 'DEPARTMENT OF NUTRITION AND DIETETICS',
                    document_type: 'article',
                    content: 'Page Title: DEPARTMENT OF NUTRITION AND DIETETICS\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/beslenme-ve-diyetetik-bolumu\n\nAbout the Department of Nutrition and Dietetics\nCourse Schedules',
                    similarity: 0.5
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Beslenme ve Diyetetik Bölümü sayfasında bölüm hakkında ve ders programı bilgileri var mı?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('department-1')
    })

    it('uses exact department slug phrase matches so similar health program pages do not outrank the named department', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'tele-health-1',
                    document_id: 'doc-tele-health-1',
                    document_title: 'VERİ TABANI, AĞ TASARIMI VE YÖNETİMİ BÖLÜMÜ<br>TELE-SAĞLIK TEKNİKERLİĞİ',
                    document_type: 'article',
                    content: 'Page Title: VERİ TABANI, AĞ TASARIMI VE YÖNETİMİ BÖLÜMÜ<br>TELE-SAĞLIK TEKNİKERLİĞİ\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/yuksekokullar/saglik-hizmetleri-meslek-yuksekokulu/bolum/veri-tabani-ag-tasarimi-ve-yonetimi-bolumu-br-tele-saglik-teknikerligi\n\nTele-sağlık teknikerliği.',
                    similarity: 0.62
                },
                {
                    chunk_id: 'health-management-1',
                    document_id: 'doc-health-management-1',
                    document_title: 'HEALTH MANAGEMENT DEPARTMENT',
                    document_type: 'article',
                    content: 'Page Title: HEALTH MANAGEMENT DEPARTMENT\nSource URL: https://yuksekihtisasuniversitesi.edu.tr/sayfa/akademik/fakulteler/saglik-bilimleri-fakultesi/bolum/saglik-yonetimi-bolumu\n\nprofessional healthcare managers\ncritical thinking',
                    similarity: 0.5
                }
            ],
            fallbackRows: []
        })

        const results = await searchKnowledgeBase(
            'Sağlık Yönetimi Bölümü sayfası hangi profesyonel sağlık yöneticilerini yetiştirmeyi hedefliyor?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results[0]?.chunk_id).toBe('health-management-1')
    })

    it('rescues staff leave policy chunks when broad keyword fallback is crowded by substring-only matches', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRowPages: [
                [
                    {
                        id: 'faq-crowded-1',
                        document_id: 'doc-faq-crowded-1',
                        content: 'Page Title: Sıkça Sorulan Sorular\nSource URL: https://example.edu.tr/sss\n\nSizin için ücretsiz psikolojik danışmanlık desteği vardır.',
                        knowledge_documents: {
                            title: 'Sıkça Sorulan Sorular',
                            type: 'article',
                            status: 'ready'
                        }
                    },
                    {
                        id: 'candidate-fees-1',
                        document_id: 'doc-candidate-fees-1',
                        content: 'Page Title: Aday Öğrenci\nSource URL: https://example.edu.tr/aday-ogrenci\n\nÜcretler, burslar ve kontenjanlar aday öğrenciler içindir.',
                        knowledge_documents: {
                            title: 'Aday Öğrenci',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ],
                [
                    {
                        id: 'leave-policy-1',
                        document_id: 'doc-leave-policy-1',
                        content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. Ücretsiz izin süresi en fazla 1 (bir) yıldır.',
                        knowledge_documents: {
                            title: 'İzin Kullanımı Yönergesi',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Personelin ücretsiz izin süresi nedir?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'leave-policy-1',
            document_id: 'doc-leave-policy-1'
        })
    })

    it('rescues acronym contact-table chunks for TLT abbreviation questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRowPages: [
                [
                    {
                        id: 'erasmus-program-1',
                        document_id: 'doc-erasmus-program-1',
                        content: 'Page Title: Öğrenci Hareketliliği\nSource URL: https://example.edu.tr/erasmus\n\nErasmus program hareketliliği ve başvuru bilgileri.',
                        knowledge_documents: {
                            title: 'Öğrenci Hareketliliği',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ],
                [
                    {
                        id: 'contact-tlt-1',
                        document_id: 'doc-contact-tlt-1',
                        content: 'Page Title: İletişim\nSource URL: https://example.edu.tr/iletisim\n\nTıbbi Laboratuvar Teknikleri Program Başkanı tlt@yiu.edu.tr.',
                        knowledge_documents: {
                            title: 'İletişim',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tlt hangi programın kısaltması olabilir?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'contact-tlt-1',
            document_id: 'doc-contact-tlt-1'
        })
    })

    it('rescues exam regulation chunks over exam calendar notices for health-report excuse questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRowPages: [
                [
                    {
                        id: 'exam-calendar-1',
                        document_id: 'doc-exam-calendar-1',
                        content: 'Page Title: Sağlık Bilimleri Fakültesi Mazeret Sınav Takvimi\nSource URL: https://example.edu.tr/takvim\n\nMazeret sınav tarihleri ve öğrenci listesi yayınlanmıştır.',
                        knowledge_documents: {
                            title: 'Sağlık Bilimleri Fakültesi Mazeret Sınav Takvimi',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ],
                [
                    {
                        id: 'focused-calendar-1',
                        document_id: 'doc-focused-calendar-1',
                        content: 'Page Title: Sağlık Bilimleri Fakültesi Mazeret Sınav Takvimi\nSource URL: https://example.edu.tr/takvim-pdf\n\nSağlık Bilimleri Fakültesi mazeret sınav takvimi ve sınava girecek öğrenci listesi.',
                        knowledge_documents: {
                            title: 'Sağlık Bilimleri Fakültesi Mazeret Sınav Takvimi',
                            type: 'article',
                            status: 'ready'
                        }
                    },
                    {
                        id: 'exam-regulation-1',
                        document_id: 'doc-exam-regulation-1',
                        content: 'Page Title: Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği\nSource URL: https://example.edu.tr/sinav-yonetmeligi.pdf\n\nSağlık mazereti nedeniyle sınavlara katılmayan öğrencilerin bu durumu sağlık raporu ile belgelendirmesi ve raporun ilgili birim yönetim kurulu tarafından kabul edilmesi gerekir. Sağlık raporu olduğu halde, sınava giren öğrencinin sınavı geçersiz sayılır.',
                        knowledge_documents: {
                            title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Sağlık raporu vermeden mazeret sınavına giremez miyim?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'exam-regulation-1',
            document_id: 'doc-exam-regulation-1'
        })
    })

    it('prefers health-report eligibility rules over calendar notices that share the same query terms', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'exam-calendar-vector-1',
                    document_id: 'doc-exam-calendar-vector-1',
                    document_title: 'Sağlık Bilimleri Fakültesi Mazeret Sınav Takvimi',
                    document_type: 'article',
                    content: 'Page Title: Sağlık Bilimleri Fakültesi Mazeret Sınav Takvimi\nSource URL: https://example.edu.tr/duyuru/mazeret-sinav-takvimi\n\nSağlık raporu olan öğrenciler için mazeret sınav takvimi ve sınava girecek öğrenci listesi yayınlanmıştır.',
                    similarity: 0.99
                }
            ],
            fallbackRowPages: [
                [],
                [
                    {
                        id: 'exam-regulation-focused-1',
                        document_id: 'doc-exam-regulation-focused-1',
                        content: 'Page Title: Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği\nSource URL: https://example.edu.tr/sinav-yonetmeligi.pdf\n\nSağlık mazereti nedeniyle sınavlara katılmayan öğrencilerin bu durumu sağlık raporu ile belgelendirmesi ve raporun ilgili birim yönetim kurulu tarafından kabul edilmesi gerekir. Sağlık raporu olduğu halde, sınava giren öğrencinin sınavı geçersiz sayılır.',
                        knowledge_documents: {
                            title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Sağlık raporu vermeden mazeret sınavına giremez miyim?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'exam-regulation-focused-1',
            document_id: 'doc-exam-regulation-focused-1'
        })
    })

    it('prefers exact document codes over generic document-control templates', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-document-template-1',
                    document_id: 'doc-generic-document-template-1',
                    document_title: 'Doküman Hazırlama ve Kontrol Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: Doküman Hazırlama ve Kontrol Yönergesi\nSource URL: https://example.edu.tr/dokuman-hazirlama.pdf\n\nDoküman No YNG.0001 Yayın Tarihi ve revizyon bilgileri.',
                    similarity: 0.98
                },
                {
                    chunk_id: 'exact-document-code-1',
                    document_id: 'doc-exact-document-code-1',
                    document_title: 'Engelli Öğrenci Birimi Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: Engelli Öğrenci Birimi Yönergesi\nSource URL: https://example.edu.tr/engelli-ogrenci-birimi-yonergesi.pdf\n\nDoküman No EÖB.YNG.0001 Yayın Tarihi 13.08.2021.',
                    similarity: 0.52
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'EÖB.YNG.0001 hangi yönergeye ait?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'exact-document-code-1',
            document_id: 'doc-exact-document-code-1'
        })
    })

    it('prefers acronym-bearing institutional documents for abbreviation questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-unit-1',
                    document_id: 'doc-generic-unit-1',
                    document_title: 'Engelli Öğrenci Birimi Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: Engelli Öğrenci Birimi Yönergesi\nSource URL: https://example.edu.tr/engelli-ogrenci-birimi.pdf\n\nEngelli Öğrenci Birimi faaliyetleri ve çalışma usulleri.',
                    similarity: 0.95
                },
                {
                    chunk_id: 'bidb-document-1',
                    document_id: 'doc-bidb-document-1',
                    document_title: 'Bilgi İşlem Daire Başkanlığı Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: Bilgi İşlem Daire Başkanlığı Yönergesi\nSource URL: https://example.edu.tr/bidb-yonergesi.pdf\n\nDoküman No BİDB.YNG.0001. BİDB, Bilgi İşlem Daire Başkanlığını ifade eder.',
                    similarity: 0.5
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'BİDB kısaltması hangi birimi ifade ediyor olabilir?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'bidb-document-1',
            document_id: 'doc-bidb-document-1'
        })
    })

    it('prefers the named yönerge over a broad program page for policy-detail questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'erasmus-program-page-1',
                    document_id: 'doc-erasmus-program-page-1',
                    document_title: 'Erasmus + Programı',
                    document_type: 'article',
                    content: 'Page Title: Erasmus + Programı\nSource URL: https://example.edu.tr/erasmus-programi\n\nErasmus öğrencileri için başvuru takvimi ve program hakkında genel bilgiler.',
                    similarity: 0.99
                },
                {
                    chunk_id: 'erasmus-directive-1',
                    document_id: 'doc-erasmus-directive-1',
                    document_title: 'Erasmus + Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: Erasmus + Yönergesi\nSource URL: https://example.edu.tr/erasmus-yonergesi.pdf\n\nErasmus+ Programı kapsamında hazırlık sınıfı öğrencileri programdan yararlanamaz.',
                    similarity: 0.55
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Erasmus+ Programı Yönergesinde hazırlık öğrencileri programdan yararlanabilir mi?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'erasmus-directive-1',
            document_id: 'doc-erasmus-directive-1'
        })
    })

    it('prefers exact regulation PDFs over broad landing pages with matching slugs', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'purchase-page-1',
                    document_id: 'doc-purchase-page-1',
                    document_title: 'Satın Alma ve İhaleler',
                    document_type: 'article',
                    content: 'Page Title: Satın Alma ve İhaleler\nSource URL: https://example.edu.tr/satin-alma-ve-ihaleler\n\nSatın Alma ve İhale Yönetmeliği bağlantısı ve ihale listesi.',
                    similarity: 0.9
                },
                {
                    chunk_id: 'purchase-regulation-1',
                    document_id: 'doc-purchase-regulation-1',
                    document_title: 'Satın Alma ve İhale Yönetmeliği',
                    document_type: 'pdf',
                    content: 'Page Title: Satın Alma ve İhale Yönetmeliği\nSource URL: https://example.edu.tr/satin-alma-ve-ihale-yonetmeligi.pdf\n\nBu Yönetmeliğin amacı, mal, hizmet ve yapım işleri alımlarında uygulanacak usul ve esasları belirlemektir.',
                    similarity: 0.68
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Satın Alma ve İhale Yönetmeliği hangi alımlar için usul ve esas belirliyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'purchase-regulation-1',
            document_id: 'doc-purchase-regulation-1'
        })
    })
})

describe('processKnowledgeDocument', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('stores chunk text with the document title so future retrieval can match title-only or translated page names', async () => {
        const { supabase, insertMock } = createProcessKnowledgeDocumentSupabase()

        await processKnowledgeDocument('doc-1', supabase)

        expect(generateEmbeddingsMock).toHaveBeenCalledWith(
            [expect.stringContaining('Document Title: Tıp Fakültesi Kurulları')],
            expect.objectContaining({
                organizationId: 'org-1'
            })
        )
        expect(insertMock).toHaveBeenCalledWith([
            expect.objectContaining({
                content: expect.stringContaining('Document Title: Tıp Fakültesi Kurulları')
            })
        ])
    })
})
