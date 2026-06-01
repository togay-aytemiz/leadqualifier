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
    appendRequiredIntakeFieldsMock,
    planKnowledgeSearchQueryMock
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
    appendRequiredIntakeFieldsMock: vi.fn(async () => {}),
    planKnowledgeSearchQueryMock: vi.fn()
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

vi.mock('@/lib/knowledge-base/query-planner', () => ({
    planKnowledgeSearchQuery: planKnowledgeSearchQueryMock
}))

import {
    createKnowledgeBaseEntry,
    generateKnowledgeBaseDraft,
    getCollections,
    getKnowledgeBaseEntriesPage,
    getSidebarData,
    getSidebarFilesPage,
    processKnowledgeDocument,
    rebuildKnowledgeDocumentChunks,
    searchKnowledgeBase,
    searchKnowledgeBaseFocusedEvidence
} from '@/lib/knowledge-base/actions'
import { buildRagContext } from '@/lib/knowledge-base/rag'

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
    rpcError?: Error
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
    fallbackRowsByFilter?: Array<{
        includes: string
        rows: Array<{
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
    holdFallbackLimits?: boolean
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
        error: options?.rpcError ?? null
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
    let lastFallbackFilter = ''
    let releaseFallbackLimits = false
    const pendingFallbackLimitResolvers: Array<() => void> = []

    const releaseHeldFallbackLimits = () => {
        releaseFallbackLimits = true
        for (const resolve of pendingFallbackLimitResolvers.splice(0)) {
            resolve()
        }
    }

    const limitMock = vi.fn(async () => {
        if (options?.holdFallbackLimits && !releaseFallbackLimits) {
            await new Promise<void>((resolve) => {
                pendingFallbackLimitResolvers.push(resolve)
            })
        }

        return {
            data: options?.fallbackRowsByFilter?.find((item) => lastFallbackFilter.includes(item.includes))?.rows
                ?? fallbackRowPages[Math.min(fallbackLimitCallCount++, fallbackRowPages.length - 1)]
                ?? [],
            error: null
        }
    })
    const keywordChain: {
        eq: ReturnType<typeof vi.fn>
        ilike: ReturnType<typeof vi.fn>
        or: ReturnType<typeof vi.fn>
        textSearch: ReturnType<typeof vi.fn>
        limit: ReturnType<typeof vi.fn>
    } = {
        eq: vi.fn(),
        ilike: vi.fn((_column: string, pattern: string) => {
            lastFallbackFilter = `${lastFallbackFilter},${pattern}`
            return keywordChain
        }),
        or: vi.fn((filter: string) => {
            lastFallbackFilter = filter
            return keywordChain
        }),
        textSearch: vi.fn((_column: string, queryValue: string) => {
            lastFallbackFilter = queryValue
            return keywordChain
        }),
        limit: limitMock
    }
    keywordChain.eq.mockReturnValue(keywordChain)

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
        ilikeMock: keywordChain.ilike,
        limitMock,
        releaseHeldFallbackLimits,
        titleDocumentOrMock: titleDocumentChain.or,
        titleDocumentLimitMock,
        titleChunkLimitMock
    }
}

function createProcessKnowledgeDocumentSupabase(documentOverrides: Partial<{
    id: string
    organization_id: string
    title: string
    content: string
}> = {}) {
    const document = {
        id: 'doc-1',
        organization_id: 'org-1',
        title: 'Tıp Fakültesi Kurulları',
        content: 'Board of Coordinators\nProf. Dr. Ayla KURKCUOGLU',
        ...documentOverrides
    }
    const documentSingleMock = vi.fn(async () => ({
        data: document,
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
            ...document,
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
        planKnowledgeSearchQueryMock.mockImplementation(async (query: string) => ({
            enabled: false,
            model: 'gpt-4o-mini',
            reason: 'disabled',
            searchQueries: [query],
            mustHaveTerms: []
        }))
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

    it('returns high-confidence campus evidence before broader address scans can block polling', async () => {
        const currentCampusRow = {
            id: 'campus-current-1',
            document_id: 'doc-campus-current-1',
            content: 'Page Title: Yerleşke Konumları Güncellendi\nSource URL: https://example.edu.tr/yerleske-konumlari\n\nSağlık Hizmetleri Meslek Yüksekokulu BAĞLUM YERLEŞKESİ içindedir.',
            knowledge_documents: {
                title: 'Yerleşke Konumları Güncellendi',
                type: 'article',
                status: 'ready'
            }
        }
        const filtersSeen: string[] = []
        const queryChain: {
            eq: ReturnType<typeof vi.fn>
            ilike: ReturnType<typeof vi.fn>
            or: ReturnType<typeof vi.fn>
            limit: ReturnType<typeof vi.fn>
        } = {
            eq: vi.fn(),
            ilike: vi.fn((_column: string, pattern: string) => {
                filtersSeen.push(pattern)
                return queryChain
            }),
            or: vi.fn((filter: string) => {
                filtersSeen.push(filter)
                return queryChain
            }),
            limit: vi.fn(async () => ({
                data: filtersSeen.some((filter) => filter.includes('Yerleşke Konumları'))
                    ? [currentCampusRow]
                    : [],
                error: null
            }))
        }
        queryChain.eq.mockReturnValue(queryChain)
        const supabase = {
            from: vi.fn((table: string) => {
                if (table !== 'knowledge_chunks') throw new Error(`Unexpected table ${table}`)
                return {
                    select: vi.fn(() => queryChain)
                }
            })
        }

        const results = await searchKnowledgeBaseFocusedEvidence(
            'SHMYO kampüsü nerede?',
            'org-1',
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'campus-current-1',
            document_id: 'doc-campus-current-1'
        })
        const combinedFilters = filtersSeen.join('\n')
        expect(combinedFilters).toContain('Yerleşke Konumları')
        expect(combinedFilters).not.toContain('Adres')
    })

    it('uses required named-campus evidence before broad current-campus listing scans', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'SBF',
                rows: [{
                    id: 'campus-required-1',
                    document_id: 'doc-campus-required-1',
                    content: 'Page Title: Yerleşke Konumları Güncellendi\nSource URL: https://example.edu.tr/yerleske-konumlari\n\nSağlık Bilimleri Fakültesi BAĞLICA YERLEŞKESİ içindedir. Bağlıca Mahallesi Höyük Caddesi No:1 Bağlıca.',
                    knowledge_documents: {
                        title: 'Yerleşke Konumları Güncellendi',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }]
        })

        const results = await searchKnowledgeBaseFocusedEvidence(
            'SBF kampüsü nerede?',
            'org-1',
            3,
            { supabase }
        )

        const broadFilters = orMock.mock.calls
            .map((call) => String(call[0] ?? ''))
            .join('\n')

        expect(results[0]).toMatchObject({
            chunk_id: 'campus-required-1',
            document_id: 'doc-campus-required-1'
        })
        expect(broadFilters).not.toContain('Yerleşke Konumları')
        expect(broadFilters).not.toContain('BAĞLICA YERLEŞKESİ')
    })

    it('uses required medicine policy evidence before broad medical-school scans', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'dönem sonu başarı',
                rows: [{
                    id: 'medicine-required-1',
                    document_id: 'doc-medicine-required-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-yonerge.pdf\n\nDönem sonu başarı notu, dönem içi kurul notunun %60’ı ile final veya bütünleme notunun %40’ı toplanarak elde edilir. Dönem içi kurul notu ders kurulu sınavlarının not ortalamasının %96’sı ile hesaplanır.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }]
        })

        const results = await searchKnowledgeBaseFocusedEvidence(
            'Tıpta dönem içi kurul notu başarı notuna nasıl yansıyor?',
            'org-1',
            3,
            { supabase }
        )

        const broadFilters = orMock.mock.calls
            .map((call) => String(call[0] ?? ''))
            .join('\n')

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-required-1',
            document_id: 'doc-medicine-required-1'
        })
        expect(broadFilters).not.toContain('dönem sonu başarı')
        expect(broadFilters).not.toContain('Dönem içi kurul notunun %60')
    })

    it('logs vector timeout errors as recoverable warnings while continuing with lexical evidence', async () => {
        const timeoutError = new Error('The operation was aborted due to timeout')
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            rpcError: timeoutError
        })
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

        try {
            const results = await searchKnowledgeBase(
                'Tıp Fakültesi kurulları kimlerden oluşuyor?',
                'org-1',
                0.5,
                3,
                { supabase }
            )

            expect(results[0]).toMatchObject({
                chunk_id: 'kw-1',
                document_id: 'doc-kw-1'
            })
            expect(warnSpy).toHaveBeenCalledWith(
                'Knowledge vector search timed out; continuing with lexical evidence:',
                timeoutError
            )
            expect(errorSpy).not.toHaveBeenCalledWith('RAG Search failed:', timeoutError)
        } finally {
            errorSpy.mockRestore()
            warnSpy.mockRestore()
        }
    })

    it('keeps high-signal query terms even when a conversational prefix comes first', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: []
        })

        await searchKnowledgeBase(
            'Merhaba arkadaşlar bugün hızlıca şunu soracağım: Tıbbi Laboratuvar Teknikleri iletişim eposta telefon',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        const filters = orMock.mock.calls
            .map((call) => String(call[0] ?? ''))
            .join('\n')
            .toLocaleLowerCase('tr-TR')

        expect(filters).toMatch(/content\.ilike\.%laboratuvar%/)
        expect(filters).toMatch(/content\.ilike\.%teknik/)
        expect(filters).toMatch(/content\.ilike\.%iletisim%/)
    })

    it('uses query planner variants to retrieve evidence without hardcoded customer phrases', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'laboratuvar',
                rows: [{
                    id: 'planner-kw-1',
                    document_id: 'doc-planner-1',
                    content: 'Document Title: Tıbbi Laboratuvar Teknikleri\n\nProgram sorumlusu ve staj bilgileri.',
                    knowledge_documents: {
                        title: 'Tıbbi Laboratuvar Teknikleri',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }]
        })
        const plannerUsage = vi.fn()

        planKnowledgeSearchQueryMock.mockResolvedValueOnce({
            enabled: true,
            model: 'gpt-4o-mini',
            reason: 'planned',
            searchQueries: [
                'Bu programda staj var mı?',
                'Tıbbi Laboratuvar Teknikleri yaz stajı'
            ],
            mustHaveTerms: ['staj', 'Tıbbi Laboratuvar Teknikleri'],
            usage: {
                inputTokens: 30,
                outputTokens: 8,
                totalTokens: 38
            }
        })

        const results = await searchKnowledgeBase(
            'Bu programda staj var mı?',
            'org-1',
            0.5,
            3,
            {
                supabase,
                plannerHistory: [{
                    role: 'assistant',
                    content: 'Tıbbi Laboratuvar Teknikleri programını konuşuyorduk.'
                }],
                queryPlannerUsage: plannerUsage
            }
        )

        const filters = orMock.mock.calls
            .map((call) => String(call[0] ?? ''))
            .join('\n')
            .toLocaleLowerCase('tr-TR')

        expect(planKnowledgeSearchQueryMock).toHaveBeenCalledWith(
            'Bu programda staj var mı?',
            [{
                role: 'assistant',
                content: 'Tıbbi Laboratuvar Teknikleri programını konuşuyorduk.'
            }],
            expect.any(Object)
        )
        expect(filters).toContain('laboratuvar')
        expect(results[0]).toMatchObject({
            chunk_id: 'planner-kw-1',
            document_id: 'doc-planner-1'
        })
        expect(plannerUsage).toHaveBeenCalledWith(expect.objectContaining({
            model: 'gpt-4o-mini',
            usage: {
                inputTokens: 30,
                outputTokens: 8,
                totalTokens: 38
            }
        }))
    })

    it('does not short-circuit history-aware planned retrieval when an ambiguous follow-up has misleading original-query hits', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'erasmus-1',
                    document_id: 'doc-erasmus-1',
                    document_title: 'Erasmus Staj Hareketliliği',
                    document_type: 'pdf',
                    content: 'Faaliyet süresi her bir öğrenim kademesi için 2 ile 12 ay arasındadır.',
                    similarity: 0.92
                },
                {
                    chunk_id: 'erasmus-2',
                    document_id: 'doc-erasmus-2',
                    document_title: 'Erasmus Başvuru Koşulları',
                    document_type: 'pdf',
                    content: 'Mezuniyet sonrası staj hareketliliği 12 ay içinde tamamlanır.',
                    similarity: 0.9
                },
                {
                    chunk_id: 'erasmus-3',
                    document_id: 'doc-erasmus-3',
                    document_title: 'Erasmus Programı',
                    document_type: 'pdf',
                    content: 'Staj süresi ay olarak hesaplanır.',
                    similarity: 0.89
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'laboratuvar',
                rows: [{
                    id: 'tlt-1',
                    document_id: 'doc-tlt',
                    content: 'Document Title: Tıbbi Laboratuvar Teknikleri\n\nTıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
                    knowledge_documents: {
                        title: 'Tıbbi Laboratuvar Teknikleri',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }]
        })

        planKnowledgeSearchQueryMock.mockResolvedValueOnce({
            enabled: true,
            model: 'gpt-4o-mini',
            reason: 'planned',
            searchQueries: [
                'Bu programda staj kaç iş günü?',
                'Tıbbi Laboratuvar Teknikleri yaz stajı 20 iş günü'
            ],
            mustHaveTerms: ['Tıbbi Laboratuvar Teknikleri', 'staj'],
            usage: {
                inputTokens: 42,
                outputTokens: 10,
                totalTokens: 52
            }
        })

        const results = await searchKnowledgeBase(
            'Bu programda staj kaç iş günü?',
            'org-1',
            0.5,
            3,
            {
                supabase,
                plannerHistory: [{
                    role: 'assistant',
                    content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajından bahsettik.'
                }]
            }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-1',
            document_id: 'doc-tlt'
        })
        expect(planKnowledgeSearchQueryMock).toHaveBeenCalledWith(
            'Bu programda staj kaç iş günü?',
            [{
                role: 'assistant',
                content: 'Tıbbi Laboratuvar Teknikleri programında yaz stajından bahsettik.'
            }],
            expect.any(Object)
        )
    })

    it('does not run planned variants when the original query already returns strong evidence', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'sbf',
                rows: [
                    {
                        id: 'campus-1',
                        document_id: 'doc-campus-1',
                        content: 'Page Title: SBF kampüs duyurusu\n\nSBF kampüsü Bağlıca yerleşkesindedir.',
                        knowledge_documents: {
                            title: 'SBF kampüs duyurusu',
                            type: 'article',
                            status: 'ready'
                        }
                    },
                    {
                        id: 'campus-2',
                        document_id: 'doc-campus-2',
                        content: 'Page Title: Sağlık Bilimleri Fakültesi\n\nSağlık Bilimleri Fakültesi kampüs adresi Bağlıca yerleşkesidir.',
                        knowledge_documents: {
                            title: 'Sağlık Bilimleri Fakültesi',
                            type: 'article',
                            status: 'ready'
                        }
                    },
                    {
                        id: 'campus-3',
                        document_id: 'doc-campus-3',
                        content: 'Page Title: Yerleşke konumları\n\nSBF için kampüs konumu Bağlıca olarak listelenmiştir.',
                        knowledge_documents: {
                            title: 'Yerleşke konumları',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            }, {
                includes: 'baglica',
                rows: [{
                    id: 'planned-campus-1',
                    document_id: 'doc-planned-campus-1',
                    content: 'Page Title: Planned campus variant\n\nBu satır yalnızca planned varyant çalışırsa döner.',
                    knowledge_documents: {
                        title: 'Planned campus variant',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }]
        })

        planKnowledgeSearchQueryMock.mockResolvedValueOnce({
            enabled: true,
            model: 'gpt-4o-mini',
            reason: 'planned',
            searchQueries: [
                'SBF kampüsü nerede?',
                'Saglik Bilimleri Fakultesi Baglica yerleskesi'
            ],
            mustHaveTerms: ['SBF', 'kampüs']
        })

        const results = await searchKnowledgeBase(
            'SBF kampüsü nerede?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        const filters = orMock.mock.calls
            .map((call) => String(call[0] ?? ''))
            .join('\n')
            .toLocaleLowerCase('tr-TR')

        expect(results[0]).toMatchObject({
            chunk_id: 'campus-2',
            document_id: 'doc-campus-2'
        })
        expect(planKnowledgeSearchQueryMock).not.toHaveBeenCalled()
        expect(filters).toContain('sbf')
        expect(filters).not.toContain('baglica')
    })

    it('does not run unrelated focused evidence probes for address-only questions', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'sbf',
                rows: [
                    {
                        id: 'campus-1',
                        document_id: 'doc-campus-1',
                        content: 'Page Title: Yerleşke konumları\n\nSBF kampüsü Bağlıca Mahallesi Höyük Caddesi No:1 adresindedir.',
                        knowledge_documents: {
                            title: 'Yerleşke konumları',
                            type: 'article',
                            status: 'ready'
                        }
                    },
                    {
                        id: 'campus-2',
                        document_id: 'doc-campus-2',
                        content: 'Page Title: Sağlık Bilimleri Fakültesi\n\nSağlık Bilimleri Fakültesi Bağlıca yerleşkesindedir.',
                        knowledge_documents: {
                            title: 'Sağlık Bilimleri Fakültesi',
                            type: 'article',
                            status: 'ready'
                        }
                    },
                    {
                        id: 'campus-3',
                        document_id: 'doc-campus-3',
                        content: 'Page Title: Kampüs\n\nSBF için kampüs bilgisi Bağlıca olarak listelenmiştir.',
                        knowledge_documents: {
                            title: 'Kampüs',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            }]
        })

        await searchKnowledgeBase(
            'SBF kampüsü nerede?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        const filters = orMock.mock.calls
            .map((call) => String(call[0] ?? ''))
            .join('\n')
            .toLocaleLowerCase('tr-TR')

        expect(filters).toContain('sbf')
        expect(filters).not.toContain('erasmus')
        expect(filters).not.toContain('staj')
        expect(filters).not.toContain('final')
        expect(filters).not.toContain('yıllık')
    })

    it('falls back to original-query retrieval when query planning fails', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [{
                id: 'original-kw-1',
                document_id: 'doc-original-1',
                content: 'Document Title: Final policy\n\nFinale girmeyen öğrenciler bütünleme sınavına girebilir.',
                knowledge_documents: {
                    title: 'Final policy',
                    type: 'pdf',
                    status: 'ready'
                }
            }]
        })

        planKnowledgeSearchQueryMock.mockResolvedValueOnce({
            enabled: true,
            model: 'gpt-4o-mini',
            reason: 'planner_error',
            searchQueries: ['Finale girmeden bütünlemeye girebilir miyim?'],
            mustHaveTerms: [],
            usage: {
                inputTokens: 20,
                outputTokens: 2,
                totalTokens: 22
            }
        })

        const results = await searchKnowledgeBase(
            'Finale girmeden bütünlemeye girebilir miyim?',
            'org-1',
            0.5,
            3,
            { supabase }
        )

        expect(results.map((result) => result.chunk_id)).toContain('original-kw-1')
    })

    it('starts independent lexical fallbacks before the first fallback query resolves', async () => {
        const { supabase, limitMock, releaseHeldFallbackLimits } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            holdFallbackLimits: true
        })

        const searchPromise = searchKnowledgeBase(
            'TLT yönergesi 2024/17 iletişim bilgileri',
            'org-1',
            0.5,
            3,
            { supabase }
        )
        await new Promise((resolve) => setTimeout(resolve, 0))

        let assertionError: unknown = null
        try {
            expect(limitMock.mock.calls.length).toBeGreaterThan(1)
        } catch (error) {
            assertionError = error
        }

        releaseHeldFallbackLimits()
        await searchPromise
        if (assertionError) throw assertionError
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

    it('keeps unpaid staff leave duration evidence inside the RAG context despite crowded staff matches', async () => {
        const longStaffMobilityText = Array.from({ length: 40 }, () =>
            'Personelin aktarmalı olarak seyahat etmesi, faaliyet süresini tamamlaması ve hareketlilik hibe tutarları açıklanır.'
        ).join(' ')
        const longAnnualLeaveText = Array.from({ length: 35 }, () =>
            'Yıllık Ücretli İzin Süreleri Madde 6- Akademik ve İdari personelin yıllık hizmetlerine göre izin süreleri 14, 20 ve 26 iş günüdür.'
        ).join(' ')
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'erasmus-staff-mobility-1',
                    document_id: 'doc-erasmus-staff-mobility-1',
                    document_title: 'Personel Hareketliliği',
                    document_type: 'article',
                    content: `Page Title: Personel Hareketliliği\nSource URL: https://example.edu.tr/erasmus/personel-hareketliligi\n\n${longStaffMobilityText}`,
                    similarity: 0.99
                }
            ],
            fallbackRowPages: [
                [
                    {
                        id: 'annual-paid-leave-1',
                        document_id: 'doc-leave-policy-1',
                        content: `Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\n${longAnnualLeaveText}`,
                        knowledge_documents: {
                            title: 'İzin Kullanımı Yönergesi',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ],
                [
                    {
                        id: 'unpaid-leave-duration-1',
                        document_id: 'doc-leave-policy-1',
                        content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. a) Ücretsiz izin süresi en fazla 1 (bir) yıldır. b) Akademik Personel için ücretsiz izin onay süreci belirtilir. c) İdari personelin talep ettiği ücretsiz izinler ilgili onaylarla verilir.',
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
            'personelin ücretsiz izin süresi ne kadar',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(context).toContain('Ücretsiz izin süresi en fazla 1 (bir) yıldır.')
    })

    it('prefers exact leave-type duration evidence over nearby mazeret leave durations', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'relative-death-leave-1',
                    document_id: 'doc-leave-policy-1',
                    document_title: 'İzin Kullanımı Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 9- d) Personelin eşinin anne, baba veya kardeşinin ölümünde 3 (üç) iş günü, mazeret izini verilir.',
                    similarity: 0.99
                },
                {
                    chunk_id: 'unpaid-leave-duration-1',
                    document_id: 'doc-leave-policy-1',
                    document_title: 'İzin Kullanımı Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. a) Ücretsiz izin süresi en fazla 1 (bir) yıldır.',
                    similarity: 0.62
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'personelin ücretsiz izin süresi ne kadar',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'unpaid-leave-duration-1',
            document_id: 'doc-leave-policy-1'
        })
    })

    it('prefers annual paid leave duration evidence over broad personnel matches', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'staff-law-noise-1',
                    document_id: 'doc-staff-law-noise-1',
                    document_title: 'Yükseköğretim Kanunu',
                    document_type: 'article',
                    content: 'Page Title: Yükseköğretim Kanunu\nSource URL: https://example.edu.tr/yuksekogretim-kanunu.pdf\n\nPersonelin özlük hakları, izinleri ve genel hükümler hakkında mevzuat bilgileri yer alır.',
                    similarity: 0.99
                },
                {
                    chunk_id: 'staff-mobility-noise-1',
                    document_id: 'doc-staff-mobility-noise-1',
                    document_title: 'Personel Hareketliliği',
                    document_type: 'article',
                    content: 'Page Title: Personel Hareketliliği\nSource URL: https://example.edu.tr/erasmus/personel-hareketliligi\n\nPersonelin hareketlilik başvuruları ve faaliyet süreleri hakkında duyuru metni.',
                    similarity: 0.97
                }
            ],
            fallbackRows: [
                {
                    id: 'annual-paid-leave-duration-1',
                    document_id: 'doc-leave-policy-1',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin-kullanimi-yonergesi.pdf\n\nYıllık Ücretli İzin Süreleri Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri; 1 yıldan 5 yıla kadar olanlar için 14 iş günü, 5 yıldan fazla 15 yıldan az olanlar için 20 iş günü, 15 yıl ve daha fazla olanlar için 26 iş günüdür. 18 ve daha küçük yaştaki işçilerle 50 ve daha yukarı yaştaki işçilere verilecek yıllık ücretli izin süresi 20 iş gününden az olamaz.',
                    knowledge_documents: {
                        title: 'İzin Kullanımı Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Personelin yıllık izin hakkı ne kadar?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'annual-paid-leave-duration-1',
            document_id: 'doc-leave-policy-1'
        })
    })

    it('prefers the annual paid leave bracket when the user asks about five-plus years of service', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'staff-general-rights-noise-1',
                    document_id: 'doc-staff-general-rights-noise-1',
                    document_title: 'Personel Hakları',
                    document_type: 'article',
                    content: 'Personelin genel hakları, görevlendirme süreçleri ve izin başlıkları hakkında özet bilgiler.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: '20 iş günü',
                rows: [{
                    id: 'annual-paid-leave-five-plus-1',
                    document_id: 'doc-leave-policy-2',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin-kullanimi-yonergesi.pdf\n\nYıllık Ücretli İzin Süreleri Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri; 1 yıldan 5 yıla kadar olanlar için 14 iş günü, 5 yıldan fazla 15 yıldan az olanlar için 20 iş günü, 15 yıl ve daha fazla olanlar için 26 iş günüdür.',
                    knowledge_documents: {
                        title: 'İzin Kullanımı Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            '5 yıldan fazla çalışan personelin yıllık izni kaç iş günü?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'annual-paid-leave-five-plus-1',
            document_id: 'doc-leave-policy-2'
        })
    })

    it('prefers the annual paid leave bracket when the user asks about fifteen years of service', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'staff-assignment-noise-1',
                    document_id: 'doc-staff-assignment-noise-1',
                    document_title: 'Personel Görevlendirme',
                    document_type: 'pdf',
                    content: 'Bu şekilde görevlendirilen personel, kurumlarından aylıklı izinli sayılır ve görevlendirmede geçen süreler fiilen kendi mesleklerinde geçirilmiş olarak kabul edilir.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: '26 iş günü',
                rows: [{
                    id: 'annual-paid-leave-fifteen-plus-1',
                    document_id: 'doc-leave-policy-3',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin-kullanimi-yonergesi.pdf\n\nYıllık Ücretli İzin Süreleri Madde 6- Akademik ve İdari personelin, yıllık hizmetlerine göre kullanabilecekleri izin süreleri; 1 yıldan 5 yıla kadar olanlar için 14 iş günü, 5 yıldan fazla 15 yıldan az olanlar için 20 iş günü, 15 yıl ve daha fazla olanlar için 26 iş günüdür.',
                    knowledge_documents: {
                        title: 'İzin Kullanımı Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            '15 yıl çalışan personelin yıllık izin hakkı kaç gün?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'annual-paid-leave-fifteen-plus-1',
            document_id: 'doc-leave-policy-3'
        })
    })

    it('prefers the current medicine directive for maximum completion duration questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'medicine-duration-general-1',
                    document_id: 'doc-medicine-duration-general-1',
                    document_title: 'Tıp Fakültesi Eğitim Süresi',
                    document_type: 'article',
                    content: 'Tıp Fakültesinde eğitim-öğretim süresi altı yıldır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'dokuz yılda',
                rows: [{
                    id: 'medicine-max-duration-current-1',
                    document_id: 'doc-medicine-directive-current-1',
                    content: 'Page Title: TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nMADDE 10- Tıp Fakültesinde eğitim-öğretim süresi altı yıldır. Öğrenciler, tıp eğitimini en fazla dokuz yılda tamamlamak zorundadır.',
                    knowledge_documents: {
                        title: 'TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesi azami kaç yılda bitirilmeli?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-max-duration-current-1',
            document_id: 'doc-medicine-directive-current-1'
        })
    })

    it('prefers the medicine Dönem VI elective deadline over generic elective-course policy matches', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-elective-policy-noise-1',
                    document_id: 'doc-generic-elective-policy-noise-1',
                    document_title: 'Yüksekokul Seçmeli Ders Politikası',
                    document_type: 'article',
                    content: 'Seçmeli derslerin sayısı ve alınma şartları yüksekokul kurulu tarafından belirlenir.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Seçmeli derslerden Dönem VI sonuna',
                rows: [{
                    id: 'medicine-elective-deadline-current-1',
                    document_id: 'doc-medicine-directive-current-2',
                    content: 'Page Title: TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nFakülte eğitim programında Dönem IV ve Dönem V’te; öğrenciler, Fakülte müfredatında yer alan Seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdırlar.',
                    knowledge_documents: {
                        title: 'TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp Fakültesinde seçmeli dersleri ne zamana kadar geçmem gerekiyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-elective-deadline-current-1',
            document_id: 'doc-medicine-directive-current-2'
        })
    })

    it('treats current-campus wording as a campus lookup for SBF acronyms', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'sbf-program-report-noise-1',
                    document_id: 'doc-sbf-program-report-noise-1',
                    document_title: 'Öz Değerlendirme Raporu',
                    document_type: 'pdf',
                    content: 'Page Title: Öz Değerlendirme Raporu\nSource URL: https://example.edu.tr/program-raporu.pdf\n\nSağlık Bilimleri Fakültesi öğrencilerine uygulama alanı sağlanır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Bağlıca',
                rows: [{
                    id: 'sbf-current-campus-acronym-1',
                    document_id: 'doc-sbf-current-campus-acronym-1',
                    content: 'Page Title: Üniversitemizde Yeni Düzenleme Kapsamında Yapılan Yerleşke Konumları Güncellendi\nSource URL: https://example.edu.tr/duyuru/yerleske-konumlari-guncellendi\n\nSAĞLIK BİLİMLERİ FAKÜLTESİ\nBAĞLICA YERLEŞKESİ: Bağlıca Mahallesi Höyük Caddesi No :1 Bağlıca',
                    knowledge_documents: {
                        title: 'Yerleşke Konumları Güncellendi',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'SBF şu an hangi yerleşkede eğitim veriyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'sbf-current-campus-acronym-1',
            document_id: 'doc-sbf-current-campus-acronym-1'
        })
    })

    it('prefers current program-campus evidence over older TLT report campus text', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'tlt-old-report-campus-1',
                    document_id: 'doc-tlt-old-report-campus-1',
                    document_title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                    document_type: 'pdf',
                    content: 'Page Title: TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU\nSource URL: https://example.edu.tr/tlt-rapor.pdf\n\nTıbbi Laboratuvar Teknikleri Programı Sağlık Hizmetleri Meslek Yüksekokulu Bağlum yerleşkesi olanaklarından yararlanır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [{
                id: 'tlt-current-campus-1',
                document_id: 'doc-tlt-current-campus-1',
                content: 'Page Title: Üniversitemizde Yeni Düzenleme Kapsamında Yapılan Yerleşke Konumları Güncellendi\nSource URL: https://example.edu.tr/duyuru/yerleske-konumlari-guncellendi\n\nMESLEK YÜKSEKOKULU\nEczane Hizmetleri\nTıbbi Laboratuvar Teknikleri\nBALGAT YERLEŞKESİ: Oğuzlar Mahallesi 1375 Sokak No: 8 Balgat',
                knowledge_documents: {
                    title: 'Yerleşke Konumları Güncellendi',
                    type: 'article',
                    status: 'ready'
                }
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıbbi Laboratuvar Teknikleri hangi yerleşkede?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-current-campus-1',
            document_id: 'doc-tlt-current-campus-1'
        })
    })

    it('prioritizes TLT double-major responsible contact over generic program contact details', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'tlt-generic-contact-1',
                    document_id: 'doc-tlt-generic-contact-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://example.edu.tr/iletisim\n\nTıbbi Laboratuvar Teknikleri Programı Telefon: +90 312 329 10 10 E-posta: tlt@yiu.edu.tr',
                    similarity: 0.99
                }
            ],
            fallbackRows: [{
                id: 'tlt-double-major-responsible-1',
                document_id: 'doc-tlt-double-major-responsible-1',
                content: 'Page Title: Çift Anadal Programları\nSource URL: https://example.edu.tr/cift-anadal-programlari\n\nProgram Sorumluları\nPROGRAM ADI\nÖĞRETİM ELEMANI\nE-MAİL İLETİŞİM\nTıbbi Laboratuvar Teknikleri\nDoç. Dr. Esma Sari Üzek\nesmasariuzek@yiu.edu.tr\nÇift Anadal Yapılabilecek Programlar\nTıbbi Laboratuvar Teknikleri\nEczane Hizmetleri',
                knowledge_documents: {
                    title: 'Çift Anadal Programları',
                    type: 'article',
                    status: 'ready'
                }
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'TLT çift anadal program sorumlusu kim ve maili ne?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-double-major-responsible-1',
            document_id: 'doc-tlt-double-major-responsible-1'
        })
    })

    it('keeps the medicine elective Dönem VI rule ahead of generic elective policy rows', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [
                {
                    id: 'generic-elective-policy-row-1',
                    document_id: 'doc-generic-elective-policy-row-1',
                    content: 'Page Title: MYO Eğitim Öğretim Yönergesi\nSource URL: https://example.edu.tr/myo-yonerge.pdf\n\nSeçmeli ders sayısına, alınması gereken seçmeli derslere ve seçmeli derslerin hangi derslerden oluşacağına Yüksekokul Kurulu karar verir.',
                    knowledge_documents: {
                        title: 'MYO Eğitim Öğretim Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                },
                {
                    id: 'medicine-elective-deadline-row-1',
                    document_id: 'doc-medicine-elective-deadline-row-1',
                    content: 'Page Title: TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ\nSource URL: https://example.edu.tr/tip-yonerge.pdf\n\nÖğrenciler, Fakülte müfredatında yer alan Seçmeli derslerden Dönem VI sonuna kadar başarılı olmalıdırlar.',
                    knowledge_documents: {
                        title: 'TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ',
                        type: 'pdf',
                        status: 'ready'
                    }
                }
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp Fakültesinde seçmeli dersleri ne zamana kadar geçmem gerekiyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-elective-deadline-row-1',
            document_id: 'doc-medicine-elective-deadline-row-1'
        })
    })

    it('recognizes shorthand Tıpta grade-formula questions as medicine exam policy lookups', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'postgraduate-grade-noise-1',
                    document_id: 'doc-postgraduate-grade-noise-1',
                    document_title: 'Lisansüstü Eğitim Öğretim ve Sınav Yönetmeliği',
                    document_type: 'pdf',
                    content: 'Page Title: Lisansüstü Eğitim Öğretim ve Sınav Yönetmeliği\nSource URL: https://example.edu.tr/lisansustu.pdf\n\nGenel başarı notu, ALES/TUS puanının %50’si, not ortalamasının %20’si ve mülakat notunun %30’u ile hesaplanır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [{
                id: 'medicine-grade-formula-current-1',
                document_id: 'doc-medicine-grade-formula-current-1',
                content: 'Page Title: TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ\nSource URL: https://example.edu.tr/tip-yonerge.pdf\n\nDönem sonu başarı notu; Dönem içi kurul notunun %60’ı, final notu veya bütünleme notunun %40’ı toplanarak elde edilir. Dönem içi kurul notu ise ders kurulu sınavlarının not ortalamasının %96’sı ile Hekimliğe Uyum Kurulu ve Kanıta Dayalı Tıp Kurulu notlarının her birinin %2’si toplanarak hesaplanır.',
                knowledge_documents: {
                    title: 'TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ',
                    type: 'pdf',
                    status: 'ready'
                }
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıpta dönem içi kurul notu başarı notuna nasıl yansıyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-grade-formula-current-1',
            document_id: 'doc-medicine-grade-formula-current-1'
        })
    })

    it('retrieves final exemption evidence for pass-without-final wording', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'final-makeup-noise-1',
                    document_id: 'doc-final-makeup-noise-1',
                    document_title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
                    document_type: 'pdf',
                    content: 'Final sınavına girmeyen öğrenciler bütünleme sınavına girer.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [{
                id: 'medicine-final-exemption-current-1',
                document_id: 'doc-medicine-final-exemption-current-1',
                content: 'Page Title: TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ\nSource URL: https://example.edu.tr/tip-yonerge.pdf\n\nDers kurulu sınav notlarının her biri en az 60 ve dönem içi kurul notu 80 veya üzerindeyse öğrenci final sınavına girmeksizin dönemi başarıyla tamamlamış kabul edilir.',
                knowledge_documents: {
                    title: 'TIP FAKÜLTESİ EĞİTİM- ÖĞRETİM VE SINAV YÖNERGESİ',
                    type: 'pdf',
                    status: 'ready'
                }
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıpta hangi şartlarda finale girmeden geçebilirim?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-final-exemption-current-1',
            document_id: 'doc-medicine-final-exemption-current-1'
        })
    })

    it('continues with keyword fallback when vector search exceeds the deadline', async () => {
        vi.useFakeTimers()
        try {
            const { supabase, rpcMock } = createHybridSearchSupabase({
                fallbackRows: [
                    {
                        id: 'kw-unpaid-leave-1',
                        document_id: 'doc-leave-policy-1',
                        content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\nSection: Madde 11- Ücretsiz izinler\n\nÜcretsiz izin süresi en fazla 1 (bir) yıldır.',
                        knowledge_documents: {
                            title: 'İzin Kullanımı Yönergesi',
                            type: 'pdf',
                            status: 'ready'
                        }
                    }
                ],
                titleRows: []
            })
            rpcMock.mockImplementationOnce(() => new Promise(() => {}))

            const searchPromise = searchKnowledgeBase(
                'personelin ücretsiz izin süresi ne kadar',
                'org-1',
                0.6,
                3,
                { supabase }
            )
            await vi.advanceTimersByTimeAsync(2501)
            const results = await searchPromise

            expect(results[0]).toMatchObject({
                chunk_id: 'kw-unpaid-leave-1',
                document_id: 'doc-leave-policy-1'
            })
        } finally {
            vi.useRealTimers()
        }
    })

    it('fuses vector and keyword channels so repeated evidence beats a single broad vector match', async () => {
        const { supabase, rpcMock } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'chunk-broad',
                    document_id: 'doc-broad',
                    document_title: 'Akademik Duyurular',
                    document_type: 'article',
                    content: 'Akademik bilgi paylaşımı genel duyurular ve süreçler kapsamında yapılır.',
                    similarity: 0.99
                },
                {
                    chunk_id: 'chunk-obs',
                    document_id: 'doc-obs',
                    document_title: 'Akademik Bilgi Paylaşımı',
                    document_type: 'pdf',
                    content: 'Akademik bilgi paylaşımı ÖBS üzerinden yapılır.',
                    similarity: 0.2
                }
            ],
            fallbackRows: [{
                id: 'chunk-obs',
                document_id: 'doc-obs',
                content: 'Page Title: Akademik Bilgi Paylaşımı\nSource URL: https://example.edu.tr/obs.pdf\n\nAkademik bilgi paylaşımı ÖBS üzerinden yapılır.',
                knowledge_documents: {
                    title: 'Akademik Bilgi Paylaşımı',
                    type: 'pdf',
                    status: 'ready'
                }
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'akademik bilgi paylaşımı',
            'org-1',
            0.6,
            2,
            { supabase, skipQueryPlanner: true }
        )

        expect(rpcMock).toHaveBeenCalledWith('match_knowledge_chunks', expect.anything())
        expect(results[0]).toMatchObject({
            chunk_id: 'chunk-obs',
            document_id: 'doc-obs',
            rrf: {
                channels: expect.arrayContaining(['vector', 'keyword'])
            }
        })
    })

    it('skips broad vector search when quick lexical evidence is already strong enough', async () => {
        const { supabase, rpcMock } = createHybridSearchSupabase({
            rpcRows: [{
                chunk_id: 'irrelevant-vector-1',
                document_id: 'doc-irrelevant-vector-1',
                document_title: 'Genel duyuru',
                document_type: 'article',
                content: 'Genel öğrenci duyuruları.',
                similarity: 0.99
            }],
            fallbackRows: [{
                id: 'tlt-staj-lexical-1',
                document_id: 'doc-tlt-staj-1',
                content: 'Page Title: Tıbbi Laboratuvar Teknikleri Staj Rehberi\nSource URL: https://example.edu.tr/tlt-staj.pdf\n\nTLT 216 Yaz Stajı 20 iş günü süresince yapılır. Tıbbi Laboratuvar Teknikleri öğrencileri yaz stajını ilgili sağlık kuruluşlarında tamamlar.',
                knowledge_documents: {
                    title: 'Tıbbi Laboratuvar Teknikleri Staj Rehberi',
                    type: 'pdf',
                    status: 'ready'
                }
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(rpcMock).not.toHaveBeenCalledWith('match_knowledge_chunks', expect.anything())
        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-staj-lexical-1',
            document_id: 'doc-tlt-staj-1'
        })
    })

    it('uses focused internship evidence before broad vector search', async () => {
        const { supabase, rpcMock } = createHybridSearchSupabase({
            rpcRows: [{
                chunk_id: 'irrelevant-vector-1',
                document_id: 'doc-irrelevant-vector-1',
                document_title: 'Genel duyuru',
                document_type: 'article',
                content: 'Genel öğrenci duyuruları.',
                similarity: 0.99
            }],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'iş günü',
                rows: [{
                    id: 'tlt-staj-focused-1',
                    document_id: 'doc-tlt-staj-focused-1',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri Staj Rehberi\nSource URL: https://example.edu.tr/tlt-staj.pdf\n\nTıbbi Laboratuvar Teknikleri Programı öğrencileri TLT 216 Yaz Stajı dersini 20 iş günü süresince tamamlar.',
                    knowledge_documents: {
                        title: 'Tıbbi Laboratuvar Teknikleri Staj Rehberi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'TLT programında yaz stajı var mı, kaç gün?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(rpcMock).not.toHaveBeenCalledWith('match_knowledge_chunks', expect.anything())
        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-staj-focused-1',
            document_id: 'doc-tlt-staj-focused-1'
        })
    })

    it('matches academic-unit acronym focuses to expanded program names for internship evidence', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'iş günü',
                rows: [{
                    id: 'tlt-expanded-staj-1',
                    document_id: 'doc-tlt-expanded-staj-1',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri Programı Öz Değerlendirme\nSource URL: https://example.edu.tr/laboratuvar-teknikleri-oz-degerlendirme.pdf\n\nTıbbi Laboratuvar Teknikleri Programı öğrencileri Yaz Stajı dersini 20 iş günü süresince tamamlar.',
                    knowledge_documents: {
                        title: 'Tıbbi Laboratuvar Teknikleri Programı Öz Değerlendirme',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBaseFocusedEvidence(
            'TLT programında yaz stajı var mı, kaç gün?',
            'org-1',
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-expanded-staj-1',
            document_id: 'doc-tlt-expanded-staj-1'
        })
    })

    it('does not run broad lexical fallbacks when policy-duration evidence already fills the result set', async () => {
        const { supabase, limitMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [
                {
                    id: 'unpaid-leave-duration-1',
                    document_id: 'doc-leave-policy-1',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. Ücretsiz izin süresi en fazla 1 (bir) yıldır.',
                    knowledge_documents: {
                        title: 'İzin Kullanımı Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                },
                {
                    id: 'unpaid-leave-duration-2',
                    document_id: 'doc-leave-policy-1',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- Akademik personel ücretsiz izin süresi en fazla 1 (bir) yıldır.',
                    knowledge_documents: {
                        title: 'İzin Kullanımı Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                },
                {
                    id: 'unpaid-leave-duration-3',
                    document_id: 'doc-leave-policy-1',
                    content: 'Page Title: İzin Kullanımı Yönergesi\nSource URL: https://example.edu.tr/izin.pdf\n\nMadde 11- İdari personel ücretsiz izin süresi en fazla 1 (bir) yıldır.',
                    knowledge_documents: {
                        title: 'İzin Kullanımı Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'personelin ücretsiz izin süresi ne kadar',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results).toHaveLength(3)
        expect(results.map((result) => result.chunk_id)).toContain('unpaid-leave-duration-1')
        expect(limitMock).toHaveBeenCalledTimes(1)
    })

    it('keeps exact policy duration evidence for non-leave duration questions', async () => {
        const longExamCalendarText = Array.from({ length: 40 }, () =>
            'Mazeret sınavı takvimi, sınav salonları, öğrenci listeleri ve duyuru yayınlama süreçleri hakkında genel bilgi verir.'
        ).join(' ')
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'exam-calendar-noise-1',
                    document_id: 'doc-exam-calendar-noise-1',
                    document_title: 'Mazeret Sınav Takvimi',
                    document_type: 'article',
                    content: `Page Title: Mazeret Sınav Takvimi\nSource URL: https://example.edu.tr/duyuru/mazeret-sinav-takvimi\n\n${longExamCalendarText}`,
                    similarity: 0.99
                }
            ],
            fallbackRowPages: [
                [
                    {
                        id: 'exam-calendar-keyword-1',
                        document_id: 'doc-exam-calendar-keyword-1',
                        content: `Page Title: Mazeret Sınav Takvimi\nSource URL: https://example.edu.tr/duyuru/mazeret-sinav-takvimi\n\n${longExamCalendarText}`,
                        knowledge_documents: {
                            title: 'Mazeret Sınav Takvimi',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ],
                [
                    {
                        id: 'exam-policy-duration-1',
                        document_id: 'doc-exam-policy-duration-1',
                        content: 'Page Title: Mazeret Sınavı Yönergesi\nSource URL: https://example.edu.tr/mazeret.pdf\n\nMadde 8- Mazeret sınavı başvurusu, sınav tarihinden itibaren en geç 5 (beş) iş günü içinde yapılır. Başvurular ilgili birime iletilir.',
                        knowledge_documents: {
                            title: 'Mazeret Sınavı Yönergesi',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Mazeret sınavı başvuru süresi ne kadar?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(context).toContain('en geç 5 (beş) iş günü')
    })

    it('rescues acronym contact-table chunks for TLT abbreviation questions before broad vector search', async () => {
        const { supabase, rpcMock } = createHybridSearchSupabase({
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

        expect(rpcMock).not.toHaveBeenCalledWith('match_knowledge_chunks', expect.anything())
        expect(results[0]).toMatchObject({
            chunk_id: 'contact-tlt-1',
            document_id: 'doc-contact-tlt-1'
        })
    })

    it('prioritizes title initialism expansions for abbreviation questions over generic keyword matches', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [
                {
                    id: 'generic-program-1',
                    document_id: 'doc-generic-program-1',
                    content: 'Page Title: Bilgisayar Programcılığı Programı\nSource URL: https://example.edu.tr/bp.pdf\n\nProgram öz değerlendirme raporu ve genel bilgiler.',
                    knowledge_documents: {
                        title: 'Bilgisayar Programcılığı Programı',
                        type: 'article',
                        status: 'ready'
                    }
                },
                {
                    id: 'initialism-tlt-1',
                    document_id: 'doc-initialism-tlt-1',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri Programı\nSource URL: https://example.edu.tr/tlt.pdf\n\nTLT 216 Yaz Stajı ve program ders kodları.',
                    knowledge_documents: {
                        title: 'Tıbbi Laboratuvar Teknikleri Programı',
                        type: 'article',
                        status: 'ready'
                    }
                }
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
            chunk_id: 'initialism-tlt-1',
            document_id: 'doc-initialism-tlt-1'
        })
    })

    it('runs a focused contact search for TLT program responsibility questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'wrong-faculty-person-1',
                    document_id: 'doc-wrong-faculty-person-1',
                    document_title: 'Eczane Hizmetleri Programı',
                    document_type: 'article',
                    content: 'Page Title: Eczane Hizmetleri Programı\nSource URL: https://example.edu.tr/eczane\n\nDoç. Dr. Esma SARI ÜZEK-Tıbbi Laboratuvar Teknikleri Programı sorumlusu.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'tlt@yiu.edu.tr',
                rows: [{
                    id: 'tlt-contact-focused-1',
                    document_id: 'doc-tlt-contact-focused-1',
                    content: 'Page Title: Program Bilgi Notu\nSource URL: https://example.edu.tr/tlt-bilgi-notu.pdf\n\nTIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI\nAdres: Yüksek İhtisas Üniversitesi Sağlık Hizmetleri Meslek Yüksekokulu Oğuzlar Mahallesi 1375 Sokak No:8 06520 Balgat/Ankara\nTelefon: +90 312 329 1010\nE-Mail: tlt@yiu.edu.tr',
                    knowledge_documents: {
                        title: 'Program Bilgi Notu',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıbbi Laboratuvar Teknikleri programının sorumlusu kim iletişim bilgisi var mı',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-contact-focused-1',
            document_id: 'doc-tlt-contact-focused-1'
        })
        expect(context).toContain('tlt@yiu.edu.tr')
    })

    it('runs a focused evidence search for TLT double-major questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-double-major-1',
                    document_id: 'doc-generic-double-major-1',
                    document_title: 'Yatay Geçiş ve Çift Anadal Yönergesi',
                    document_type: 'article',
                    content: 'Page Title: Yönerge\nSource URL: https://example.edu.tr/genel-cift-anadal.pdf\n\nÇift anadal başvuruları hakkında genel koşullar.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Eczane Hizmetleri',
                rows: [{
                    id: 'tlt-double-major-focused-1',
                    document_id: 'doc-tlt-report-1',
                    content: 'Page Title: TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU\nSource URL: https://example.edu.tr/tlt-oz-degerlendirme.pdf\n\n*Tıbbi Dokümantasyon ve Sekreterlik Programı öğrencileri, Tıbbi Tanıtım ve Pazarlama Programında çift anadal programına kayıt yaptırabilirler.\n\n*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler. Her iki programa kaydedilecek öğrenci kontenjanları, her yıl Eğitim-Öğretim yılı başlamadan önce yüksekokul tarafından belirlenir. Kontenjanları belirlenen ve yayınlanan çift anadal programına öğrenciler, üçüncü yarıyılın başında başvurabilir.',
                    knowledge_documents: {
                        title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıbbi Laboratuvar Teknikleri programında çift anadal yapabilir miyim',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-double-major-focused-1',
            document_id: 'doc-tlt-report-1',
            source_url: 'https://example.edu.tr/tlt-oz-degerlendirme.pdf'
        })
        expect(context).toContain('Eczane Hizmetleri Programında')
        expect(context).not.toContain('Tıbbi Dokümantasyon')
    })

    it('treats ÇAP as a double-major intent before broad vector search', async () => {
        const { supabase, rpcMock } = createHybridSearchSupabase({
            rpcRows: [{
                chunk_id: 'generic-cap-1',
                document_id: 'doc-generic-cap-1',
                document_title: 'Genel Öğrenci Duyurusu',
                document_type: 'article',
                content: 'Genel duyuru.',
                similarity: 0.99
            }],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Eczane Hizmetleri',
                rows: [{
                    id: 'tlt-cap-focused-1',
                    document_id: 'doc-tlt-cap-1',
                    content: 'Page Title: TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU\nSource URL: https://example.edu.tr/tlt-oz-degerlendirme.pdf\n\n*Tıbbi Laboratuvar Teknikleri Programı öğrencileri, Eczane Hizmetleri Programında ve Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında çift anadal programına kayıt yaptırabilirler. Her iki programa kaydedilecek öğrenci kontenjanları her yıl belirlenir; öğrenciler üçüncü yarıyılın başında başvurabilir.',
                    knowledge_documents: {
                        title: 'TIBBİ LABORATUVAR TEKNİKLERİ PROGRAMI - 2025 ÖZ DEĞERLENDİRME RAPORU',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'TLT öğrencisi ÇAP şartları nelerdir?',
            'org-1',
            0.6,
            6,
            { supabase }
        )

        expect(rpcMock).not.toHaveBeenCalledWith('match_knowledge_chunks', expect.anything())
        expect(results[0]).toMatchObject({
            chunk_id: 'tlt-cap-focused-1',
            document_id: 'doc-tlt-cap-1'
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

    it('prefers medical school exam directive rules over broad faculty event pages for final and makeup questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'medicine-event-noise-1',
                    document_id: 'doc-medicine-event-noise-1',
                    document_title: 'Tıp Fakültesinden Mezun Olunca',
                    document_type: 'article',
                    content: 'Page Title: Tıp Fakültesinden Mezun Olunca\nSource URL: https://example.edu.tr/etkinlik/tip-fakultesinden-mezun-olunca\n\nTıp Fakültesi final ve bütünleme döneminde düzenlenen mezuniyet etkinliği hakkında genel bilgiler.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [
                {
                    id: 'medicine-final-makeup-rule-1',
                    document_id: 'doc-medicine-exam-directive-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nMadde 23- Final sınavına girmesi gerektiği halde girmeyen veya final sınavından başarısız olan öğrenci bütünleme sınavına girer. Bütünleme sınavında alınan not final sınavı notu yerine geçer.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-final-makeup-rule-1',
            document_id: 'doc-medicine-exam-directive-1'
        })
    })

    it('keeps medical school grade calculation rules inside RAG context over broad faculty pages', async () => {
        const broadFacultyText = Array.from({ length: 45 }, () =>
            'Tıp Fakültesi eğitim süreci, sınıf düzeyleri, kurul sınavları ve öğrenci etkinlikleri hakkında genel tanıtım bilgileri.'
        ).join(' ')
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'medicine-broad-page-1',
                    document_id: 'doc-medicine-broad-page-1',
                    document_title: 'Tıp Fakültesi',
                    document_type: 'article',
                    content: `Page Title: Tıp Fakültesi\nSource URL: https://example.edu.tr/sayfa/akademik/fakulteler/tip-fakultesi\n\n${broadFacultyText}`,
                    similarity: 0.99
                }
            ],
            fallbackRows: [
                {
                    id: 'medicine-grade-calculation-rule-1',
                    document_id: 'doc-medicine-exam-directive-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nMadde 30- Dönem sonu başarı notu, kurul sınavları ortalamasının %60\'ı ile final veya bütünleme sınavı notunun %40\'ının toplamından oluşur. Öğrencinin dönemden başarılı sayılabilmesi için dönem sonu başarı notunun en az 60 olması gerekir.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(context).toContain('kurul sınavları ortalamasının %60')
        expect(context).toContain('final veya bütünleme sınavı notunun %40')
    })

    it('runs a focused medical-school policy search when broad fallback misses grade calculation evidence', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'medicine-directive-intro-1',
                    document_id: 'doc-medicine-exam-directive-1',
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    document_type: 'article',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nMadde 5- Tıp Fakültesinde eğitim-öğretim süresi altı yıldır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [
                {
                    id: 'medicine-broad-keyword-1',
                    document_id: 'doc-medicine-broad-keyword-1',
                    content: 'Page Title: Tıp Fakültesi\nSource URL: https://example.edu.tr/tip-fakultesi\n\nTıp Fakültesi sınıf düzeyleri ve kurul sınavları hakkında genel tanıtım bilgileri.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi',
                        type: 'article',
                        status: 'ready'
                    }
                }
            ],
            fallbackRowsByFilter: [{
                includes: 'dönem sonu başarı',
                rows: [{
                    id: 'medicine-grade-focused-1',
                    document_id: 'doc-medicine-exam-directive-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nDönem I, II ve III Ders Kurulları puanlarının ortalamasının %60’ı ile yıl sonu sınavı final veya bütünleme sınavı notunun %40’ı toplanarak dönem sonu başarı notu elde edilir.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesinde sınıf geçmek için not hesaplama nasıl yapılıyor?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(context).toContain('ortalamasının %60')
        expect(context).toContain('notunun %40')
    })

    it('runs a focused medical-school policy search for final-to-makeup rights when generic retrieval misses the article', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'strategic-plan-noise-1',
                    document_id: 'doc-strategic-plan-noise-1',
                    document_title: '2024-2028 Stratejik Plan',
                    document_type: 'article',
                    content: 'Page Title: 2024-2028 Stratejik Plan\nSource URL: https://example.edu.tr/stratejik-plan.pdf\n\nTıp Fakültesi final ve bütünleme başarı göstergeleri stratejik plan kapsamında izlenir.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Yıl Sonu genel sınavının mazeret sınavı',
                rows: [{
                    id: 'medicine-final-makeup-focused-1',
                    document_id: 'doc-medicine-exam-directive-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nYıl Sonu genel sınavının mazeret sınavı Bütünleme sınavıdır. Yıl Sonu ve Bütünleme sınavları için ayrıca mazeret sınavı yapılmaz.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesinde finale girmeden bütünlemeye girebilir miyim?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-final-makeup-focused-1',
            document_id: 'doc-medicine-exam-directive-1'
        })
        expect(context).toContain('Yıl Sonu genel sınavının mazeret sınavı Bütünleme sınavıdır.')
    })

    it('runs a focused final policy search when a generic final/class-pass question misses the rule', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'calendar-noise-1',
                    document_id: 'doc-calendar-noise-1',
                    document_title: 'Final Sınav Takvimi',
                    document_type: 'article',
                    content: 'Page Title: Final Sınav Takvimi\nSource URL: https://example.edu.tr/final-takvimi\n\nFinal ve bütünleme sınav tarihleri yayınlanmıştır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'yarıyıl sonu sınavında başarısız olan veya yarıyıl sonu sınavına girmeyen',
                rows: [{
                    id: 'generic-final-policy-focused-1',
                    document_id: 'doc-undergrad-regulation-1',
                    content: 'Page Title: Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği\nSource URL: https://example.edu.tr/onlisans-lisans-sinav-yonetmeligi.pdf\n\nBütünleme sınavları, yarıyıl sonu sınavında başarısız olan veya yarıyıl sonu sınavına girmeyen öğrencilere uygulanır.',
                    knowledge_documents: {
                        title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Finale girmeden sınıf geçebilir miyim?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'generic-final-policy-focused-1',
            document_id: 'doc-undergrad-regulation-1'
        })
        expect(context).toContain('yarıyıl sonu sınavına girmeyen öğrencilere uygulanır')
    })

    it('runs a focused medical-school training search for medicine clinical internship questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'national-internship-noise-1',
                    document_id: 'doc-national-internship-noise-1',
                    document_title: 'Ulusal Staj Programı',
                    document_type: 'article',
                    content: 'Page Title: Ulusal Staj Programı\nSource URL: https://example.edu.tr/ulusal-staj\n\nUlusal staj programı kapsamında öğrenciler başvuru yapabilir.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Dönem IV ve V’te stajlardan',
                rows: [{
                    id: 'medicine-training-staj-focused-1',
                    document_id: 'doc-medicine-training-policy-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nTıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitim-öğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesinde klinik stajlar hangi dönemlerde?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-training-staj-focused-1',
            document_id: 'doc-medicine-training-policy-1'
        })
        expect(context).toContain('Dönem IV ve V’te stajlardan')
        expect(context).toContain('Dönem VI’da İntörnlük Stajlarından')
    })

    it('does not answer a focused academic-unit internship query from another program with incidental wording', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'shmyo-tlt-summer-internship-noise-1',
                    document_id: 'doc-shmyo-tlt-info-1',
                    document_title: 'Sağlık Hizmetleri Meslek Yüksekokulu Bilgi Paketi',
                    document_type: 'article',
                    content: 'Page Title: Sağlık Hizmetleri Meslek Yüksekokulu\nSource URL: https://example.edu.tr/saglik-hizmetleri-meslek-yuksekokulu\n\nTıbbi Laboratuvar Teknikleri Programı öğrencileri Tıp Fakültesi Hastaneleri ve özel hastanelerde klinik uygulama alır. Birinci yıl sonunda zorunlu yaz stajı bulunmaktadır.',
                    similarity: 0.99
                },
                {
                    chunk_id: 'medicine-training-staj-focused-1',
                    document_id: 'doc-medicine-training-policy-1',
                    document_title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nTıp eğitim- öğretimi; Dönem I, II ve III’te temel olarak ders kurullarından, Dönem IV ve V’te stajlardan oluşan Klinik Tıp Bilimleri eğitim-öğretimi ve Dönem VI’da İntörnlük Stajlarından oluşan İntörnlük eğitim- öğretimi esasına göre yapılır.',
                    similarity: 0.72
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Tıp fakültesinde yaz stajı var mı?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'medicine-training-staj-focused-1',
            document_id: 'doc-medicine-training-policy-1'
        })
        expect(context).toContain('Dönem IV ve V’te stajlardan')
        expect(context).not.toContain('Tıbbi Laboratuvar Teknikleri Programı öğrencileri')
        expect(context).not.toContain('zorunlu yaz stajı bulunmaktadır')
    })

    it('runs a focused learning-platform search when the user asks where lecture notes are shared', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'course-info-noise-1',
                    document_id: 'doc-course-info-noise-1',
                    document_title: 'Ders Bilgileri',
                    document_type: 'article',
                    content: 'Page Title: Ders Bilgileri\nSource URL: https://example.edu.tr/ders-bilgileri.pdf\n\nDersin amacı, öğrenme çıktıları ve haftalık programı açıklanır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'ders notlarının paylaşımı',
                rows: [{
                    id: 'lecture-notes-platform-focused-1',
                    document_id: 'doc-quality-report-1',
                    content: 'Page Title: Kalite Raporu\nSource URL: https://example.edu.tr/kalite-raporu.pdf\n\nUZEM/MEDU sistemleri ile uzaktan eğitim başarı ile yürütülmüştür. Bu sistem sayesinde çevrim içi dersler gerçekleştirilmiş olup, aynı zamanda ders notlarının paylaşımı da kolaylıkla sağlanmıştır.',
                    knowledge_documents: {
                        title: 'Kalite Raporu',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Ders notlarına nereden ulaşabilirim?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'lecture-notes-platform-focused-1',
            document_id: 'doc-quality-report-1'
        })
        expect(context).toContain('UZEM/MEDU')
        expect(context).toContain('ders notlarının paylaşımı')
    })

    it('uses selective required evidence before broad lecture-note OR search', async () => {
        const { supabase, ilikeMock, limitMock, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'SHMYO',
                rows: [{
                    id: 'lecture-notes-required-1',
                    document_id: 'doc-course-materials-1',
                    content: 'Page Title: SHMYO Ders Bilgi Paketi\nSource URL: https://example.edu.tr/shmyo-ders-bilgi-paketi.pdf\n\nDers içeriği ve ders materyalleri ÖBS’ye yüklenerek öğrencilerin erişimine açılır.',
                    knowledge_documents: {
                        title: 'SHMYO Ders Bilgi Paketi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBaseFocusedEvidence(
            'SHMYO ders içeriklerine nereden ulaşabilirim?',
            'org-1',
            6,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'lecture-notes-required-1',
            document_id: 'doc-course-materials-1'
        })
        expect(ilikeMock).toHaveBeenCalledWith('content', expect.stringContaining('SHMYO'))
        expect(ilikeMock).toHaveBeenCalledWith('content', expect.stringContaining('ÖBS'))
        expect(limitMock).toHaveBeenCalledTimes(1)
        expect(orMock).not.toHaveBeenCalled()
    })

    it('skips broad health-report OR search when required remedy evidence is enough', async () => {
        const { supabase, orMock } = createHybridSearchSupabase({
            rpcRows: [],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'sağlık raporu',
                rows: [{
                    id: 'health-remedy-required-1',
                    document_id: 'doc-undergrad-exam-1',
                    content: 'Page Title: Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği\nSource URL: https://example.edu.tr/yonetmelik.pdf\n\nSağlık raporu ile belgelendirilen mazeretlerde ilgili Yönetim Kurulu kararıyla mazeret sınavı yapılır.',
                    knowledge_documents: {
                        title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }]
        })

        const results = await searchKnowledgeBaseFocusedEvidence(
            'Sağlık raporu vermeden mazeret sınavına giremez miyim?',
            'org-1',
            6,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'health-remedy-required-1',
            document_id: 'doc-undergrad-exam-1'
        })
        expect(orMock).not.toHaveBeenCalled()
    })

    it('runs a focused elective policy search when the user asks how many electives are required', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'quality-system-noise-1',
                    document_id: 'doc-quality-system-noise-1',
                    document_title: 'Quality Assurance Systems',
                    document_type: 'article',
                    content: 'Page Title: Quality Assurance Systems\nSource URL: https://example.edu.tr/kalite\n\nMezuniyet sürecinde kalite güvencesi, ders bilgi paketleri ve öğrenci geri bildirimleri izlenir.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'seçmeli ders sayısına',
                rows: [{
                    id: 'elective-count-focused-1',
                    document_id: 'doc-undergrad-regulation-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-egitim-ogretim-ve-sinav-yonergesi.pdf\n\nSeçmeli derslerin hangi derslerden oluşacağına, yarıyıllara dağılımına, öğrenci tarafından alınması gereken seçmeli ders sayısına, AKTS kredisine ve bu derslerin açılabilmesi için gerekli öğrenci sayısına Fakülte Kurulu karar verir.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'article',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Mezun olana kadar kaç seçmeli ders almalıyım?',
            'org-1',
            0.6,
            6,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(context).toContain('öğrenci tarafından alınması gereken seçmeli ders sayısına')
        expect(context).toContain('Fakülte Kurulu karar verir')
    })

    it('prefers subject-specific address evidence over the generic contact page for address questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'root-contact-noise-1',
                    document_id: 'doc-root-contact-noise-1',
                    document_title: 'İletişim',
                    document_type: 'article',
                    content: 'Page Title: İletişim\nSource URL: https://example.edu.tr/iletisim\n\nAdres: Oğuzlar Mahallesi 1375. Sokak No: 8 Balgat / Ankara. Telefon: +90 312 329 10 10.',
                    similarity: 0.98
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Adres:',
                rows: [{
                    id: 'shmyo-address-evidence-1',
                    document_id: 'doc-shmyo-address-evidence-1',
                    content: 'Page Title: Sağlık Hizmetleri Meslek Yüksekokulu\nSource URL: https://example.edu.tr/shmyo-tanitim.pdf\n\nSağlık Hizmetleri Meslek Yüksekokulu (SHMYO) kampüsü adres bilgisi: Karakaya Mahallesi Bağlum Bulvarı No:1, 06291 Keçiören/Ankara.',
                    knowledge_documents: {
                        title: 'Sağlık Hizmetleri Meslek Yüksekokulu Tanıtım PDF',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Sağlık Hizmetleri MYO nerede, açık adresi nedir?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'shmyo-address-evidence-1',
            document_id: 'doc-shmyo-address-evidence-1'
        })
        expect(context).toContain('Karakaya Mahallesi')
        expect(context).toContain('Keçiören/Ankara')
    })

    it('uses acronym/entity address evidence for short district questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'shmyo-announcement-noise-1',
                    document_id: 'doc-shmyo-announcement-noise-1',
                    document_title: 'SHMYO Tek Ders Sınavı Duyurusu',
                    document_type: 'article',
                    content: 'Page Title: SHMYO Tek Ders Sınavı Duyurusu\nSource URL: https://example.edu.tr/duyuru/shmyo-tek-ders\n\nSağlık Hizmetleri Meslek Yüksekokulu tek ders sınav takvimi yayınlanmıştır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Adres:',
                rows: [{
                    id: 'shmyo-district-evidence-1',
                    document_id: 'doc-shmyo-district-evidence-1',
                    content: 'Page Title: Sağlık Hizmetleri Meslek Yüksekokulu\nSource URL: https://example.edu.tr/shmyo-tanitim.pdf\n\nSHMYO adresi: Karakaya Mahallesi Bağlum Bulvarı No:1, 06291 Keçiören/Ankara.',
                    knowledge_documents: {
                        title: 'Sağlık Hizmetleri Meslek Yüksekokulu Tanıtım PDF',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'SHMYO hangi ilçede?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'shmyo-district-evidence-1',
            document_id: 'doc-shmyo-district-evidence-1'
        })
    })

    it('prefers campus-location evidence over generic SBF PDF footer addresses', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'sbf-footer-pdf-1',
                    document_id: 'doc-sbf-footer-pdf-1',
                    document_title: 'SBF Koordinatörler Kurulu Yönergesi',
                    document_type: 'pdf',
                    content: 'Page Title: SBF Koordinatörler Kurulu Yönergesi\nSource URL: https://example.edu.tr/sbf-koordinatorler-kurulu.pdf\n\nSBF DEKANI Sağlık Bilimleri Fakültesi Kalite Koordinatörlüğü. Adres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10.',
                    similarity: 0.995
                },
                {
                    chunk_id: 'sbf-campus-location-1',
                    document_id: 'doc-sbf-campus-location-1',
                    document_title: 'Sıkça Sorulan Sorular',
                    document_type: 'article',
                    content: 'Page Title: Sıkça Sorulan Sorular\nSource URL: https://example.edu.tr/sikca-sorulan-sorular\n\nÜniversite Ankara’nın neresindedir?\nBalgat yerleşkesi (Sağlık Bilimleri Fakültesi)\nOğuzlar Mahallesi, 1375. Sk. No: 8, Çankaya / Ankara.',
                    similarity: 0.82
                }
            ],
            fallbackRows: [],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Sbf kampüsü nerede?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'sbf-campus-location-1',
            document_id: 'doc-sbf-campus-location-1'
        })
    })

    it('does not let unrelated program reports outrank a campus-location source for faculty campus questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'program-report-address-noise-1',
                    document_id: 'doc-program-report-address-noise-1',
                    document_title: 'Öz Değerlendirme Raporu',
                    document_type: 'pdf',
                    content: 'Page Title: Öz Değerlendirme Raporu\nSource URL: https://example.edu.tr/yuksekokul_bolum_icerikleri_view/program-raporu.pdf\n\nSağlık Bilimleri Fakültesi öğrencileriyle ortak etkinlik yapılır. Adres: Oğuzlar Mahallesi 1375. Sokak No:8, Balgat/Ankara.',
                    similarity: 0.99
                },
                {
                    chunk_id: 'sbf-campus-location-2',
                    document_id: 'doc-sbf-campus-location-2',
                    document_title: 'Yerleşke Konumları Güncellendi',
                    document_type: 'article',
                    content: 'Page Title: Üniversitemizde Yeni Düzenleme Kapsamında Yapılan Yerleşke Konumları Güncellendi\nSource URL: https://example.edu.tr/duyuru/yerleske-konumlari-guncellendi\n\nSAĞLIK BİLİMLERİ FAKÜLTESİ\nBAĞLICA YERLEŞKESİ: Bağlıca Mahallesi Höyük Caddesi No :1 Bağlıca',
                    similarity: 0.78
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Adres :',
                rows: [{
                    id: 'sbf-address-pdf-2',
                    document_id: 'doc-sbf-address-pdf-2',
                    content: 'Page Title: SBF Koordinatörler Kurulu Yönergesi\nSource URL: https://example.edu.tr/sbf-koordinatorler-kurulu.pdf\n\nSBF DEKANI Sağlık Bilimleri Fakültesi Kalite Koordinatörlüğü. Adres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10.',
                    knowledge_documents: {
                        title: 'SBF Koordinatörler Kurulu Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Sağlık Bilimleri Fakültesi hangi yerleşkede eğitim veriyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'sbf-campus-location-2',
            document_id: 'doc-sbf-campus-location-2'
        })
    })

    it('treats course materials wording as lecture-notes access evidence', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'course-package-noise-1',
                    document_id: 'doc-course-package-noise-1',
                    document_title: 'Ders Bilgi Paketi',
                    document_type: 'article',
                    content: 'Page Title: Ders Bilgi Paketi\nSource URL: https://example.edu.tr/bilgi-paketi\n\nDerslerin AKTS ve içerik bilgileri listelenir.',
                    similarity: 0.97
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Ders Materyali',
                rows: [{
                    id: 'course-materials-evidence-1',
                    document_id: 'doc-course-materials-evidence-1',
                    content: 'Page Title: Eğitim Öğretim Süreçleri\nSource URL: https://example.edu.tr/egitim-ogretim-surecleri.pdf\n\nDers içeriği ve Ders Materyali UZEM/MEDU sistemlerine yüklenerek öğrencilerin erişimine açılır. Ders notlarının paylaşımı bu sistemler üzerinden yapılır.',
                    knowledge_documents: {
                        title: 'Eğitim Öğretim Süreçleri PDF',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Ders materyalleri ve notlar nerede paylaşılır?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'course-materials-evidence-1',
            document_id: 'doc-course-materials-evidence-1'
        })
        expect(context).toContain('UZEM/MEDU')
        expect(context).toContain('Ders Materyali')
    })

    it('does not treat "nereden" learning-material questions as address lookups', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'address-pdf-noise-1',
                    document_id: 'doc-address-pdf-noise-1',
                    document_title: 'Program Bilgi Notu',
                    document_type: 'pdf',
                    content: 'Page Title: Program Bilgi Notu\nSource URL: https://example.edu.tr/program-bilgi-notu.pdf\n\nAdres: Oğuzlar Mahallesi 1375 Sokak No:8, 06520 Çankaya/Ankara.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'ders notlarının paylaşımı',
                rows: [{
                    id: 'lecture-notes-nereden-evidence-1',
                    document_id: 'doc-lecture-notes-nereden-evidence-1',
                    content: 'Page Title: Eğitim Öğretim Süreçleri\nSource URL: https://example.edu.tr/egitim-ogretim-surecleri.pdf\n\nDers notlarının paylaşımı UZEM/MEDU sistemleri üzerinden sağlanır. Ders Materyali öğrencilerin erişimine açılır.',
                    knowledge_documents: {
                        title: 'Eğitim Öğretim Süreçleri PDF',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Ders notlarına nereden ulaşabilirim?',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'lecture-notes-nereden-evidence-1',
            document_id: 'doc-lecture-notes-nereden-evidence-1'
        })
    })

    it('prefers elective governance policy when the user asks who determines electives', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'program-contact-noise-1',
                    document_id: 'doc-program-contact-noise-1',
                    document_title: 'Tıbbi Laboratuvar Teknikleri',
                    document_type: 'article',
                    content: 'Page Title: Tıbbi Laboratuvar Teknikleri\nSource URL: https://example.edu.tr/tlt\n\nProgram iletişim bilgisi: Telefon +90 312 329 10 10.',
                    similarity: 0.98
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Fakülte Kurulu karar verir',
                rows: [{
                    id: 'elective-governance-evidence-1',
                    document_id: 'doc-elective-governance-evidence-1',
                    content: 'Page Title: Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/egitim-ogretim-ve-sinav-yonergesi.pdf\n\nSeçmeli derslerin hangi derslerden oluşacağına, yarıyıllara dağılımına, öğrenci tarafından alınması gereken seçmeli ders sayısına ve AKTS kredisine Fakülte Kurulu karar verir.',
                    knowledge_documents: {
                        title: 'Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Seçmeli ders sayısını kim belirliyor?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'elective-governance-evidence-1',
            document_id: 'doc-elective-governance-evidence-1'
        })
        expect(context).toContain('Fakülte Kurulu karar verir')
    })

    it('routes standalone makeup/final abbreviations to final-exam policy evidence', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'exam-announcement-noise-1',
                    document_id: 'doc-exam-announcement-noise-1',
                    document_title: 'Final Sınav Takvimi',
                    document_type: 'article',
                    content: 'Page Title: Final Sınav Takvimi\nSource URL: https://example.edu.tr/duyuru/final-takvimi\n\nFinal sınav tarihleri ve salon listesi yayınlanmıştır.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'Final sınavına girmesi gerektiği halde girmeyen',
                rows: [{
                    id: 'final-makeup-evidence-1',
                    document_id: 'doc-final-makeup-evidence-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-sinav-yonergesi.pdf\n\nFinal sınavına girmesi gerektiği halde girmeyen öğrenci başarısız sayılır. Bütünleme sınavında alınan not final sınavı notu yerine geçer.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Finale girmeden büt hakkım olur mu?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'final-makeup-evidence-1',
            document_id: 'doc-final-makeup-evidence-1'
        })
        expect(context).toContain('Final sınavına girmesi gerektiği halde girmeyen')
        expect(context).toContain('Bütünleme sınavında alınan not')
    })

    it('prefers excuse-exam policy for sick/board-exam questions without exact faculty wording', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'proctor-rule-noise-1',
                    document_id: 'doc-proctor-rule-noise-1',
                    document_title: 'Tıp Fakültesi Sınav Uygulamaları',
                    document_type: 'pdf',
                    content: 'Page Title: Tıp Fakültesi Sınav Uygulamaları\nSource URL: https://example.edu.tr/sinav-uygulamalari.pdf\n\nKurul sınavında gözetmenlerin görevleri ve salon düzeni açıklanır.',
                    similarity: 0.98
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'sağlık raporu ile belgelendirmesi',
                rows: [{
                    id: 'excuse-exam-evidence-1',
                    document_id: 'doc-excuse-exam-evidence-1',
                    content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-sinav-yonergesi.pdf\n\nÖğrencinin sınava girmesini engelleyen hastalık durumunu sağlık raporu ile belgelendirmesi gerekir. Yönetim Kurulu tarafından kabul edilen mazeretler için mazeret sınavı yapılır.',
                    knowledge_documents: {
                        title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                        type: 'pdf',
                        status: 'ready'
                    }
                }]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Kurul sınavına hastalık nedeniyle giremedim, telafi sınavı hakkım var mı?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'excuse-exam-evidence-1',
            document_id: 'doc-excuse-exam-evidence-1'
        })
        expect(context).toContain('sağlık raporu ile belgelendirmesi')
        expect(context).toContain('mazeret sınavı yapılır')
    })

    it('prefers remedy evidence over generic health-report attendance text for missed-exam questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'generic-health-report-vector-1',
                    document_id: 'doc-generic-health-report-vector-1',
                    document_title: 'Sağlık Raporu ve Devamsızlık',
                    document_type: 'pdf',
                    content: 'Page Title: Sağlık Raporu ve Devamsızlık\nSource URL: https://example.edu.tr/saglik-raporu.pdf\n\nSağlık raporu ile mazeretli sayılan öğrencilerin devamsızlık durumları açıklanır. Raporlu günlerde dersler ve sınavlar devamsızlık süresinden sayılmaz.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [
                {
                    includes: 'sağlık raporu ile belgelendirmesi',
                    rows: [{
                        id: 'generic-health-report-keyword-1',
                        document_id: 'doc-generic-health-report-keyword-1',
                        content: 'Page Title: Sağlık Raporu ve Devamsızlık\nSource URL: https://example.edu.tr/saglik-raporu.pdf\n\nSağlık raporu ile belgelendirmesi gereken mazeretlerde devamsızlık kayıtları ve raporlu öğrencinin derslere katılım durumu açıklanır.',
                        knowledge_documents: {
                            title: 'Sağlık Raporu ve Devamsızlık',
                            type: 'pdf',
                            status: 'ready'
                        }
                    }]
                },
                {
                    includes: 'mazeret sınavı',
                    rows: [{
                        id: 'excuse-exam-remedy-evidence-1',
                        document_id: 'doc-excuse-exam-remedy-evidence-1',
                        content: 'Page Title: Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi\nSource URL: https://example.edu.tr/tip-fakultesi-sinav-yonergesi.pdf\n\nÖğrencinin sınava girmesini engelleyen hastalık durumunu sağlık raporu ile belgelendirmesi gerekir. Yönetim Kurulu tarafından kabul edilen mazeretler için mazeret sınavı yapılır.',
                        knowledge_documents: {
                            title: 'Tıp Fakültesi Eğitim-Öğretim ve Sınav Yönergesi',
                            type: 'pdf',
                            status: 'ready'
                        }
                    }]
                }
            ],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Kurul sınavına hasta olduğum için giremedim. Başka sınav hakkım var mı?',
            'org-1',
            0.6,
            3,
            { supabase }
        )
        const { context } = buildRagContext(results)

        expect(results[0]).toMatchObject({
            chunk_id: 'excuse-exam-remedy-evidence-1',
            document_id: 'doc-excuse-exam-remedy-evidence-1'
        })
        expect(context).toContain('mazeret sınavı yapılır')
        expect(context).not.toContain('devamsızlık kayıtları')
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

    it('uses eligibility evidence instead of a coordinator page for informal Erasmus preparation questions', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'erasmus-coordinator-page-1',
                    document_id: 'doc-erasmus-coordinator-page-1',
                    document_title: 'Uluslararası Öğrenci Koordinatörlüğü',
                    document_type: 'article',
                    content: 'Page Title: Uluslararası Öğrenci Koordinatörlüğü\nSource URL: https://example.edu.tr/sayfa/kurumsal/idari-birimler/koordinatorlukler/uluslararasi-ogrenci-koordinatorlugu\n\nErasmus programı hakkında bilgi almak için uluslararası öğrenci koordinatörlüğü ile iletişime geçebilirsiniz.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'hazırlık sınıfı öğrencileri',
                rows: [
                    {
                        id: 'erasmus-directive-informal-1',
                        document_id: 'doc-erasmus-directive-informal-1',
                        content: 'Page Title: Erasmus + Yönergesi\nSource URL: https://example.edu.tr/erasmus-yonergesi.pdf\n\nErasmus+ Programı kapsamında hazırlık sınıfı öğrencileri programdan yararlanamaz.',
                        knowledge_documents: {
                            title: 'Erasmus + Yönergesi',
                            type: 'pdf',
                            status: 'ready'
                        }
                    }
                ]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Hazırlık öğrencisi erasmustan yararlanır mı',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'erasmus-directive-informal-1',
            document_id: 'doc-erasmus-directive-informal-1'
        })
    })

    it('uses root contact evidence for unit email questions instead of unrelated staff emails', async () => {
        const { supabase } = createHybridSearchSupabase({
            rpcRows: [
                {
                    chunk_id: 'library-staff-page-1',
                    document_id: 'doc-library-staff-page-1',
                    document_title: 'Kütüphane Hizmetleri Raporu',
                    document_type: 'article',
                    content: 'Page Title: Kütüphane Hizmetleri Raporu\nSource URL: https://example.edu.tr/sayfa/kurumsal/idari-birimler/daire-baskanliklari/kutuphane-ve-dokumantasyon-daire-baskanligi\n\nİlgili program iletişim bilgisi: E-posta: busraaydos@yiu.edu.tr.',
                    similarity: 0.99
                }
            ],
            fallbackRows: [],
            fallbackRowsByFilter: [{
                includes: 'kutuphane@yuksekihtisas.edu.tr',
                rows: [
                    {
                        id: 'root-contact-library-1',
                        document_id: 'doc-root-contact-library-1',
                        content: [
                            'Page Title: İletişim',
                            'Source URL: https://example.edu.tr/iletisim',
                            '',
                            'Kütüphane ve Dokümantasyon Daire Başkanlığı',
                            '(+90 312) 329 1010 (+90 312) 286 3608',
                            '115',
                            'kutuphane@yuksekihtisas.edu.tr'
                        ].join('\n'),
                        knowledge_documents: {
                            title: 'İletişim',
                            type: 'article',
                            status: 'ready'
                        }
                    }
                ]
            }],
            titleRows: []
        })

        const results = await searchKnowledgeBase(
            'Kütüphane maili neydi',
            'org-1',
            0.6,
            3,
            { supabase }
        )

        expect(results[0]).toMatchObject({
            chunk_id: 'root-contact-library-1',
            document_id: 'doc-root-contact-library-1'
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

    it('stores legal article sections as separate indexed chunks with section metadata', async () => {
        generateEmbeddingsMock.mockResolvedValueOnce([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6],
            [0.7, 0.8, 0.9]
        ])
        const { supabase, insertMock } = createProcessKnowledgeDocumentSupabase({
            title: 'İzin Kullanımı Yönergesi',
            content: [
                'MADDE 9 - Mazeret İzni',
                'Personelin eşinin anne, baba veya kardeşinin ölümünde 3 (üç) iş günü mazeret izni verilir.',
                '',
                'MADDE 10 - Yıllık İzin',
                'Yıllık izin talepleri ilgili amirin onayı ile kullanılır.',
                '',
                'MADDE 11 - Ücretsiz İzin',
                'Ücretsiz izin süresi en fazla 1 (bir) yıldır.'
            ].join('\n')
        })

        await processKnowledgeDocument('doc-1', supabase)

        const embeddedContents = generateEmbeddingsMock.mock.calls.at(-1)?.[0] as string[]
        expect(embeddedContents).toHaveLength(3)
        expect(embeddedContents[0]).toContain('Section: MADDE 9 - Mazeret İzni')
        expect(embeddedContents[2]).toContain('Section: MADDE 11 - Ücretsiz İzin')
        expect(embeddedContents[2]).toContain('Ücretsiz izin süresi en fazla 1 (bir) yıldır.')
        expect(embeddedContents[2]).not.toContain('3 (üç) iş günü')
        expect(insertMock).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                chunk_index: 2,
                content: expect.stringContaining('Section: MADDE 11 - Ücretsiz İzin')
            })
        ]))
    })

    it('uses the same section-aware chunking for non-regulation document headings', async () => {
        generateEmbeddingsMock.mockResolvedValueOnce([
            [0.1, 0.2, 0.3],
            [0.4, 0.5, 0.6]
        ])
        const { supabase } = createProcessKnowledgeDocumentSupabase({
            title: 'Aday Öğrenci Bilgilendirme',
            content: [
                'BAŞVURU ŞARTLARI',
                'Aday öğrenciler başvuru formunu eksiksiz doldurmalıdır.',
                '',
                'İLETİŞİM BİLGİLERİ',
                'Aday öğrenci ofisine telefon ve e-posta ile ulaşılabilir.'
            ].join('\n')
        })

        await processKnowledgeDocument('doc-1', supabase)

        const embeddedContents = generateEmbeddingsMock.mock.calls.at(-1)?.[0] as string[]
        expect(embeddedContents).toHaveLength(2)
        expect(embeddedContents[0]).toContain('Section: BAŞVURU ŞARTLARI')
        expect(embeddedContents[1]).toContain('Section: İLETİŞİM BİLGİLERİ')
    })

    it('indexes table rows as standalone evidence chunks with section metadata', async () => {
        generateEmbeddingsMock.mockImplementationOnce(async (texts: string[]) => (
            texts.map(() => [0.1, 0.2, 0.3])
        ))
        const { supabase } = createProcessKnowledgeDocumentSupabase({
            title: 'Tıbbi Laboratuvar Teknikleri Ders Planı',
            content: [
                'YAZ STAJI',
                '| Ders Kodu | Ders Adı | Süre | AKTS |',
                '| --- | --- | --- | --- |',
                '| TLT 216 | Yaz Stajı | 20 iş günü | 4 |',
                '| TLT 214 | Klinik Uygulama | 10 iş günü | 3 |'
            ].join('\n')
        })

        await processKnowledgeDocument('doc-1', supabase)

        const embeddedContents = generateEmbeddingsMock.mock.calls.at(-1)?.[0] as string[]
        const tableRowChunk = embeddedContents.find((content) => (
            content.includes('Evidence Type: table-row')
            && content.includes('Evidence Label: TLT 216')
        ))

        expect(tableRowChunk).toBeTruthy()
        expect(tableRowChunk).toContain('Document Title: Tıbbi Laboratuvar Teknikleri Ders Planı')
        expect(tableRowChunk).toContain('Section: YAZ STAJI')
        expect(tableRowChunk).toContain('Ders Kodu: TLT 216')
        expect(tableRowChunk).toContain('Ders Adı: Yaz Stajı')
        expect(tableRowChunk).toContain('Süre: 20 iş günü')
        expect(tableRowChunk).not.toContain('TLT 214')
    })

    it('indexes high-signal contact lines as standalone evidence chunks', async () => {
        generateEmbeddingsMock.mockImplementationOnce(async (texts: string[]) => (
            texts.map(() => [0.1, 0.2, 0.3])
        ))
        const { supabase } = createProcessKnowledgeDocumentSupabase({
            title: 'Program Bilgi Notu',
            content: [
                'İLETİŞİM BİLGİLERİ',
                'Tıbbi Laboratuvar Teknikleri Programı Telefon: +90 312 329 10 10 E-posta: tlt@yiu.edu.tr',
                '',
                'Program hakkında genel açıklamalar burada yer alır.'
            ].join('\n')
        })

        await processKnowledgeDocument('doc-1', supabase)

        const embeddedContents = generateEmbeddingsMock.mock.calls.at(-1)?.[0] as string[]
        const evidenceRowChunk = embeddedContents.find((content) => (
            content.includes('Evidence Type: evidence-row')
            && content.includes('tlt@yiu.edu.tr')
        ))

        expect(evidenceRowChunk).toBeTruthy()
        expect(evidenceRowChunk).toContain('Document Title: Program Bilgi Notu')
        expect(evidenceRowChunk).toContain('Section: İLETİŞİM BİLGİLERİ')
        expect(evidenceRowChunk).toContain('+90 312 329 10 10')
    })
})

describe('rebuildKnowledgeDocumentChunks', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rebuilds chunks without requiring tenant-user authorization when caller already owns authorization', async () => {
        generateEmbeddingsMock.mockImplementationOnce(async (texts: string[]) => (
            texts.map(() => [0.1, 0.2, 0.3])
        ))
        const { supabase, insertMock } = createProcessKnowledgeDocumentSupabase({
            title: 'Program Bilgi Notu',
            content: [
                'İLETİŞİM BİLGİLERİ',
                'Tıbbi Laboratuvar Teknikleri Programı Telefon: +90 312 329 10 10 E-posta: tlt@yiu.edu.tr'
            ].join('\n')
        })

        const result = await rebuildKnowledgeDocumentChunks('doc-1', supabase)

        expect(assertTenantWriteAllowedMock).not.toHaveBeenCalled()
        expect(result).toMatchObject({
            documentId: 'doc-1',
            organizationId: 'org-1'
        })
        expect(result.chunkCount).toBeGreaterThan(1)
        expect(insertMock).toHaveBeenCalledWith(expect.arrayContaining([
            expect.objectContaining({
                content: expect.stringContaining('Evidence Type: evidence-row')
            })
        ]))
    })
})
