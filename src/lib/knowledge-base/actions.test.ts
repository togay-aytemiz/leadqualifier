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

    const limitMock = vi.fn(async () => ({
        data: fallbackRows,
        error: null
    }))
    const orMock = vi.fn(() => ({
        limit: limitMock
    }))
    const eqMock = vi.fn(() => ({
        or: orMock
    }))
    const selectMock = vi.fn(() => ({
        eq: eqMock
    }))
    const fromMock = vi.fn((table: string) => {
        if (table !== 'knowledge_chunks') {
            throw new Error(`Unexpected table ${table}`)
        }

        return {
            select: selectMock
        }
    })

    return {
        supabase: {
            rpc: rpcMock,
            from: fromMock
        },
        rpcMock,
        orMock,
        limitMock
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
        const { supabase, orMock } = createHybridSearchSupabase({
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
        const { supabase, orMock } = createHybridSearchSupabase({
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
