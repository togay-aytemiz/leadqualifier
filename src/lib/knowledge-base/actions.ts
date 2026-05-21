'use server'

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding, generateEmbeddings, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import { chunkText, estimateTokenCount } from '@/lib/knowledge-base/chunking'
import {
    generateKnowledgeBaseDraftFromBrief,
    type KnowledgeBaseDraftBrief,
    type KnowledgeBaseDraftResult
} from '@/lib/knowledge-base/ai-draft'
import {
    appendServiceCatalogCandidates,
    appendOfferingProfileSuggestion,
    appendRequiredIntakeFields
} from '@/lib/leads/offering-profile'
import {
    DEFAULT_KNOWLEDGE_ENTRIES_PAGE_SIZE,
    DEFAULT_SIDEBAR_FILES_PAGE_SIZE,
    MAX_KNOWLEDGE_ENTRIES_PAGE_SIZE,
    MAX_SIDEBAR_FILES_PAGE_SIZE
} from '@/lib/knowledge-base/pagination'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { revalidatePath } from 'next/cache'

export interface KnowledgeCollection {
    id: string
    organization_id: string
    name: string
    description: string | null
    icon: string
    created_at: string
    count?: number
}

export interface KnowledgeBaseEntry {
    id: string
    organization_id: string
    collection_id: string | null
    title: string
    type: 'article' | 'snippet' | 'pdf'
    content: string
    source?: string
    language?: string | null
    status?: 'ready' | 'processing' | 'error'
    created_at: string
    updated_at: string
    collection?: KnowledgeCollection | null
}

export type KnowledgeBaseInsert = Pick<KnowledgeBaseEntry, 'content' | 'title' | 'type' | 'collection_id'>
export interface CreateKnowledgeBaseEntryResult {
    document: KnowledgeBaseEntry
    showFirstDocumentGuidance: boolean
}

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>
type KnowledgeCountRow = { collection_id: string | null }
type KnowledgeCollectionCountRow = { collection_id: string | null; document_count: number | string | null }
type KnowledgeFileRow = Pick<KnowledgeBaseEntry, 'id' | 'title' | 'type'> & { collection_id: string | null }
const MAX_PROFILE_CONTEXT_CHARS = 6000
const COUNT_SCAN_PAGE_SIZE = 1000
const VECTOR_SEARCH_TIMEOUT_MS = 2500

export interface KnowledgeEntriesPage {
    entries: KnowledgeBaseEntry[]
    totalCount: number
    nextOffset: number
    hasMore: boolean
    pageSize: number
}

export interface SidebarFilesPage {
    files: SidebarFile[]
    totalCount: number
    nextOffset: number
    hasMore: boolean
    pageSize: number
}

interface KnowledgeEntriesPageOptions {
    collectionId?: string | null
    organizationId?: string | null
    offset?: number
    limit?: number
}

interface SidebarFilesPageOptions {
    collectionId: string | null
    organizationId?: string | null
    offset?: number
    limit?: number
    supabase?: SupabaseClientLike
}

interface KnowledgeSearchResult {
    chunk_id: string
    document_id: string
    document_title: string
    document_type: string
    content: string
    similarity: number
    source_url?: string | null
}

interface KeywordSearchRow {
    id: string
    document_id: string
    chunk_index?: number | null
    content: string
    knowledge_documents?: {
        id?: string | null
        title?: string | null
        type?: string | null
        status?: string | null
        collection_id?: string | null
        language?: string | null
    } | null
}

interface TitleSearchDocumentRow {
    id: string
    title: string | null
    type: string | null
    status: string | null
}

interface IndexedSourceChunk {
    content: string
    tokenCount: number
    sectionTitle?: string
}

type AbortableQuery<T> = PromiseLike<T> & {
    abortSignal?: (signal: AbortSignal) => PromiseLike<T>
}

/**
 * --- COLLECTIONS ---
 */

/**
 * --- HELPERS ---
 */
async function getUserOrganization(supabase: SupabaseClientLike) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('Unauthorized')

    // Get the first organization the user is a member of
    const { data: member, error } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (error || !member) throw new Error('No organization found')
    return member.organization_id
}

async function getScopedOrganizationId(
    supabase: SupabaseClientLike,
    organizationId?: string | null
) {
    if (organizationId) return organizationId
    const context = await resolveActiveOrganizationContext(supabase)
    return context?.activeOrganizationId ?? null
}

function buildProfileContextContent(title: string, content: string) {
    const normalizedTitle = (title ?? '').trim()
    const normalizedContent = (content ?? '').trim()
    if (!normalizedContent) return normalizedTitle

    if (normalizedContent.length <= MAX_PROFILE_CONTEXT_CHARS) {
        return normalizedTitle
            ? `${normalizedTitle}\n${normalizedContent}`
            : normalizedContent
    }

    const truncatedContent = normalizedContent.slice(0, MAX_PROFILE_CONTEXT_CHARS).trimEnd()
    return normalizedTitle
        ? `${normalizedTitle}\n${truncatedContent}\n\n[TRUNCATED_FOR_PROFILE_CONTEXT]`
        : `${truncatedContent}\n\n[TRUNCATED_FOR_PROFILE_CONTEXT]`
}

function normalizePageWindow(offset: number | undefined, limit: number | undefined, defaultLimit: number, maxLimit: number) {
    const safeOffset = Number.isFinite(offset) && Number(offset) > 0
        ? Math.floor(Number(offset))
        : 0
    const requestedLimit = Number.isFinite(limit) && Number(limit) > 0
        ? Math.floor(Number(limit))
        : defaultLimit
    const safeLimit = Math.min(Math.max(requestedLimit, 1), maxLimit)

    return {
        from: safeOffset,
        to: safeOffset + safeLimit - 1,
        limit: safeLimit
    }
}

function normalizeExactCount(count: number | null | undefined) {
    return Number.isFinite(count) ? Number(count) : 0
}

function mapKnowledgeEntry(item: KnowledgeBaseEntry & { collection?: KnowledgeCollection | KnowledgeCollection[] | null }) {
    return {
        ...item,
        collection: Array.isArray(item.collection) ? item.collection[0] : item.collection
    } as KnowledgeBaseEntry
}

function withQueryTimeout<T>(query: PromiseLike<T> | AbortableQuery<T>, timeoutMs: number, label: string) {
    const abortSignal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : null
    const abortableQuery = abortSignal && typeof (query as AbortableQuery<T>).abortSignal === 'function'
        ? (query as AbortableQuery<T>).abortSignal?.(abortSignal) ?? query
        : query

    return new Promise<T>((resolve, reject) => {
        const timeoutId = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`))
        }, timeoutMs)

        Promise.resolve(abortableQuery)
            .then((result) => {
                clearTimeout(timeoutId)
                resolve(result)
            })
            .catch((error) => {
                clearTimeout(timeoutId)
                reject(error)
            })
    })
}

/**
 * --- COLLECTIONS ---
 */

export async function getCollections(organizationId?: string | null) {
    const supabase = await createClient()
    const scopedOrganizationId = await getScopedOrganizationId(supabase, organizationId)

    // Get collections
    let collectionsQuery = supabase
        .from('knowledge_collections')
        .select('*')
        .order('name')
    if (scopedOrganizationId) {
        collectionsQuery = collectionsQuery.eq('organization_id', scopedOrganizationId)
    }

    const { data: collections, error } = await collectionsQuery

    if (error) throw new Error(error.message)

    const countMap = new Map<string, number>()
    const { data: aggregatedCounts, error: aggregatedCountError } = await supabase.rpc(
        'count_knowledge_documents_by_collection',
        {
            target_organization_id: scopedOrganizationId ?? null
        }
    )

    if (aggregatedCountError) {
        console.warn('Falling back to document row scan for knowledge collection counts:', aggregatedCountError)

        const counts = await scanKnowledgeDocumentCollectionIds(supabase, scopedOrganizationId)
        ;(counts ?? []).forEach((item: KnowledgeCountRow) => {
            if (item.collection_id) {
                countMap.set(item.collection_id, (countMap.get(item.collection_id) || 0) + 1)
            }
        })
    } else {
        ;((aggregatedCounts ?? []) as KnowledgeCollectionCountRow[]).forEach((item) => {
            if (!item.collection_id) return
            const nextCount = Number(item.document_count ?? 0)
            countMap.set(item.collection_id, Number.isFinite(nextCount) ? nextCount : 0)
        })
    }

    return (collections ?? []).map(col => ({
        ...col,
        count: countMap.get(col.id) || 0
    })) as KnowledgeCollection[]
}

export async function createCollection(name: string, description?: string, icon: string = 'folder') {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const organizationId = await getUserOrganization(supabase)

    const { data, error } = await supabase
        .from('knowledge_collections')
        .insert({
            name,
            description,
            icon,
            organization_id: organizationId
        })
        .select()
        .single()

    if (error) throw new Error(error.message)
    revalidatePath('/knowledge')
    return data as KnowledgeCollection
}

/**
 * --- ENTRIES ---
 */

export async function createKnowledgeBaseEntry(
    entry: KnowledgeBaseInsert
): Promise<CreateKnowledgeBaseEntryResult> {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const organizationId = await getUserOrganization(supabase)
    const { count, error: countError } = await supabase
        .from('knowledge_documents')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

    if (countError) {
        console.error('Failed to count knowledge documents before create:', countError)
        throw new Error(countError.message)
    }

    const existingDocumentCount = Number.isFinite(count) ? Number(count) : 0

    // 1. Insert document in processing state
    const { data, error } = await supabase
        .from('knowledge_documents')
        .insert({
            content: entry.content,
            title: entry.title,
            type: entry.type,
            collection_id: entry.collection_id,
            organization_id: organizationId,
            source: 'manual',
            status: 'processing'
        })
        .select()
        .single()

    if (error || !data) {
        console.error('Failed to create knowledge document:', error)
        throw new Error(error?.message ?? 'Failed to create knowledge document')
    }

    revalidatePath('/knowledge')
    return {
        document: data as KnowledgeBaseEntry,
        showFirstDocumentGuidance: existingDocumentCount === 0
    }
}

export async function generateKnowledgeBaseDraft(options: {
    locale: string
    brief: KnowledgeBaseDraftBrief
}): Promise<KnowledgeBaseDraftResult> {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const scopedOrganizationId = await getScopedOrganizationId(supabase)
    const organizationId = scopedOrganizationId ?? await getUserOrganization(supabase)

    return generateKnowledgeBaseDraftFromBrief({
        organizationId,
        locale: options.locale,
        brief: options.brief,
        supabase
    })
}

export async function deleteKnowledgeBaseEntry(id: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { error } = await supabase.from('knowledge_documents').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/knowledge')
}

export async function processKnowledgeDocument(
    documentId: string,
    supabaseOverride?: SupabaseClientLike
) {
    const supabase = supabaseOverride ?? await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data, error } = await supabase
        .from('knowledge_documents')
        .select('id, organization_id, title, content')
        .eq('id', documentId)
        .single()

    if (error || !data) {
        throw new Error(error?.message ?? 'Knowledge document not found')
    }

    try {
        await supabase.from('knowledge_chunks').delete().eq('document_id', data.id)
        await buildAndStoreChunks(supabase, data.organization_id, data.id, data.title ?? '', data.content ?? '')
        const { data: readyDoc } = await supabase
            .from('knowledge_documents')
            .update({ status: 'ready' })
            .eq('id', data.id)
            .select()
            .single()

        const finalDoc = (readyDoc ?? data) as KnowledgeBaseEntry
        const profileContent = buildProfileContextContent(finalDoc.title, finalDoc.content)

        try {
            await appendServiceCatalogCandidates({
                organizationId: finalDoc.organization_id,
                sourceType: 'knowledge',
                sourceId: finalDoc.id,
                content: profileContent,
                supabase
            })
        } catch (error) {
            console.error('Failed to propose knowledge-based services:', error)
        }

        try {
            await appendOfferingProfileSuggestion({
                organizationId: finalDoc.organization_id,
                sourceType: 'knowledge',
                sourceId: finalDoc.id,
                content: profileContent,
                supabase
            })
        } catch (error) {
            console.error('Failed to propose knowledge-based offering profile suggestion:', error)
        }

        try {
            await appendRequiredIntakeFields({
                organizationId: finalDoc.organization_id,
                sourceType: 'knowledge',
                content: profileContent,
                supabase
            })
        } catch (error) {
            console.error('Failed to propose knowledge-based required intake fields:', error)
        }

        revalidatePath('/knowledge')
        return finalDoc
    } catch (err) {
        console.error('Failed to build knowledge chunks:', err)
        await supabase.from('knowledge_documents').update({ status: 'error' }).eq('id', data.id)
        throw err
    }
}

export async function getKnowledgeBaseEntry(id: string, organizationId?: string | null) {
    const supabase = await createClient()
    const scopedOrganizationId = await getScopedOrganizationId(supabase, organizationId)

    let query = supabase
        .from('knowledge_documents')
        .select(`
            id, organization_id, content, title, type, collection_id, status, created_at, updated_at,
            collection:knowledge_collections(*)
        `)
        .eq('id', id)

    if (scopedOrganizationId) {
        query = query.eq('organization_id', scopedOrganizationId)
    }

    const { data, error } = await query.single()

    if (error) throw new Error(error.message)

    return {
        ...data,
        collection: Array.isArray(data.collection) ? data.collection[0] : data.collection
    } as KnowledgeBaseEntry
}

export async function updateKnowledgeBaseEntry(id: string, entry: Partial<KnowledgeBaseInsert>) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const contentChanged = typeof entry.content === 'string'
    const titleChanged = typeof entry.title === 'string'

    // If content or title changed, mark as processing so retrieval skips it
    const updates: Partial<KnowledgeBaseInsert> & { status?: 'processing' } = { ...entry }
    if (contentChanged || titleChanged) {
        updates.status = 'processing'
    }

    const { data, error } = await supabase
        .from('knowledge_documents')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error || !data) throw new Error(error?.message ?? 'Failed to update knowledge document')

    revalidatePath('/knowledge')
    return data as KnowledgeBaseEntry
}

export async function getKnowledgeBaseEntriesPage(options: KnowledgeEntriesPageOptions = {}): Promise<KnowledgeEntriesPage> {
    const supabase = await createClient()
    const scopedOrganizationId = await getScopedOrganizationId(supabase, options.organizationId)
    const { from, to, limit } = normalizePageWindow(
        options.offset,
        options.limit,
        DEFAULT_KNOWLEDGE_ENTRIES_PAGE_SIZE,
        MAX_KNOWLEDGE_ENTRIES_PAGE_SIZE
    )

    let query = supabase
        .from('knowledge_documents')
        .select(`
            id, organization_id, content, title, type, collection_id, status, created_at, updated_at,
            collection:knowledge_collections(*)
        `, { count: 'exact' })

    if (scopedOrganizationId) {
        query = query.eq('organization_id', scopedOrganizationId)
    }

    if (options.collectionId) {
        query = query.eq('collection_id', options.collectionId)
    } else {
        // If collectionId is specifically null (root), filter for null.
        if (options.collectionId === null) {
            query = query.is('collection_id', null)
        }
    }

    const { data, count, error } = await query
        .order('created_at', { ascending: false })
        .range(from, to)

    if (error) throw new Error(error.message)

    const entries = (data ?? []).map((item) => mapKnowledgeEntry(item as KnowledgeBaseEntry & {
        collection?: KnowledgeCollection | KnowledgeCollection[] | null
    }))
    const totalCount = normalizeExactCount(count)
    const nextOffset = from + entries.length

    return {
        entries,
        totalCount,
        nextOffset,
        hasMore: nextOffset < totalCount,
        pageSize: limit
    }
}

export async function getKnowledgeBaseEntries(collectionId?: string | null, organizationId?: string | null) {
    const page = await getKnowledgeBaseEntriesPage({
        collectionId,
        organizationId,
        limit: DEFAULT_KNOWLEDGE_ENTRIES_PAGE_SIZE
    })

    return page.entries
}

export async function searchKnowledgeBase(
    query: string,
    organizationId: string,
    threshold = 0.5,
    limit = 3,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const supabase = options?.supabase || await createClient()
    let data: KnowledgeSearchResult[] | null = null
    const vectorLimit = Math.max(limit, Math.min(12, limit * 2))

    let embedding: number[] | null = null
    try {
        embedding = await generateEmbedding(query, {
            organizationId,
            supabase,
            usageMetadata: {
                source: 'knowledge_search_query_embedding'
            }
        })
    } catch (error) {
        console.error('Embedding generation failed:', error)
    }

    if (embedding) {
        try {
            const vectorQuery = supabase.rpc('match_knowledge_chunks', {
                query_embedding: formatEmbeddingForPgvector(embedding),
                match_threshold: threshold,
                match_count: vectorLimit,
                filter_org_id: organizationId,
                filter_collection_id: options?.collectionId ?? null,
                filter_type: options?.type ?? null,
                filter_language: options?.language ?? null
            })
            const { data: result, error } = await withQueryTimeout(
                vectorQuery,
                VECTOR_SEARCH_TIMEOUT_MS,
                'Knowledge vector search'
            )

            if (error) {
                console.error('RAG Search failed:', error)
            } else {
                data = (result ?? null) as KnowledgeSearchResult[] | null
            }
        } catch (error) {
            console.warn('Knowledge vector search unavailable:', error)
        }
    }

    const fallbackLimit = Math.max(limit * 8, 40)
    const fallbackOptions = {
        collectionId: options?.collectionId ?? null,
        type: options?.type ?? null,
        language: options?.language ?? null,
        supabase
    }
    const policyDurationResults = await searchKnowledgeBaseByPolicyDurationEvidence(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
    const fallbackResults = await searchKnowledgeBaseByKeyword(query, organizationId, fallbackLimit, fallbackOptions)
    const documentCodeResults = await searchKnowledgeBaseByDocumentCode(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
    const abbreviationResults = await searchKnowledgeBaseByAbbreviation(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
    const focusedKeywordResults = await searchKnowledgeBaseByFocusedKeywords(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
    const exactTitlePhraseResults = await searchKnowledgeBaseByExactTitlePhrase(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
    const titleResults = await searchKnowledgeBaseByTitle(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
    const sourceResults = shouldUseSourcePathFallback(query)
        ? await searchKnowledgeBaseBySourcePath(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
        : []
    const lexicalResults = [
        ...policyDurationResults,
        ...fallbackResults,
        ...documentCodeResults,
        ...abbreviationResults,
        ...focusedKeywordResults,
        ...exactTitlePhraseResults,
        ...titleResults,
        ...sourceResults
    ]

    if ((!data || data.length === 0) && lexicalResults.length > 0) {
        return mergeSearchResults(query, [], lexicalResults, limit)
    }

    if (!data) return []

    return mergeSearchResults(query, data, lexicalResults, limit)
}
export interface SidebarCollection extends KnowledgeCollection {
    files: SidebarFile[]
    count: number
    loadedFileCount: number
    hasMoreFiles: boolean
}

export type SidebarFile = Pick<KnowledgeBaseEntry, 'id' | 'title' | 'type'>

export interface SidebarData {
    collections: SidebarCollection[]
    uncategorized: SidebarFile[]
    uncategorizedCount: number
    uncategorizedHasMore: boolean
    totalCount: number
}

export async function getSidebarData(organizationId?: string | null) {
    const supabase = await createClient()
    const scopedOrganizationId = await getScopedOrganizationId(supabase, organizationId)

    // 1. Get Collections
    let collectionsQuery = supabase
        .from('knowledge_collections')
        .select('*')
        .order('name')
    if (scopedOrganizationId) {
        collectionsQuery = collectionsQuery.eq('organization_id', scopedOrganizationId)
    }

    const { data: collections, error: colsError } = await collectionsQuery

    if (colsError) throw new Error(colsError.message)

    const countMap = new Map<string, number>()
    const { data: aggregatedCounts, error: aggregatedCountError } = await supabase.rpc(
        'count_knowledge_documents_by_collection',
        {
            target_organization_id: scopedOrganizationId ?? null
        }
    )

    if (aggregatedCountError) {
        console.warn('Falling back to paginated document row scan for knowledge sidebar counts:', aggregatedCountError)
        const counts = await scanKnowledgeDocumentCollectionIds(supabase, scopedOrganizationId)
        ;(counts ?? []).forEach((item: KnowledgeCountRow) => {
            if (item.collection_id) {
                countMap.set(item.collection_id, (countMap.get(item.collection_id) || 0) + 1)
            }
        })
    } else {
        ;((aggregatedCounts ?? []) as KnowledgeCollectionCountRow[]).forEach((item) => {
            if (!item.collection_id) return
            const nextCount = Number(item.document_count ?? 0)
            countMap.set(item.collection_id, Number.isFinite(nextCount) ? nextCount : 0)
        })
    }

    let totalCountQuery = supabase
        .from('knowledge_documents')
        .select('id', { count: 'exact', head: true })
    if (scopedOrganizationId) {
        totalCountQuery = totalCountQuery.eq('organization_id', scopedOrganizationId)
    }

    const { count: totalDocumentCount, error: totalCountError } = await totalCountQuery
    if (totalCountError) throw new Error(totalCountError.message)

    const uncategorizedPage = await getSidebarFilesPage({
        collectionId: null,
        organizationId: scopedOrganizationId,
        offset: 0,
        limit: DEFAULT_SIDEBAR_FILES_PAGE_SIZE,
        supabase
    })

    const typedCollections = (collections ?? []) as KnowledgeCollection[]
    const sidebarData: SidebarCollection[] = listToTree(typedCollections, countMap)

    return {
        collections: sidebarData,
        uncategorized: uncategorizedPage.files,
        uncategorizedCount: uncategorizedPage.totalCount,
        uncategorizedHasMore: uncategorizedPage.hasMore,
        totalCount: normalizeExactCount(totalDocumentCount)
    } as SidebarData
}

export async function getSidebarFilesPage(options: SidebarFilesPageOptions): Promise<SidebarFilesPage> {
    const supabase = options.supabase ?? await createClient()
    const scopedOrganizationId = await getScopedOrganizationId(supabase, options.organizationId)
    const { from, to, limit } = normalizePageWindow(
        options.offset,
        options.limit,
        DEFAULT_SIDEBAR_FILES_PAGE_SIZE,
        MAX_SIDEBAR_FILES_PAGE_SIZE
    )

    let filesQuery = supabase
        .from('knowledge_documents')
        .select('id, title, type, collection_id', { count: 'exact' })

    if (scopedOrganizationId) {
        filesQuery = filesQuery.eq('organization_id', scopedOrganizationId)
    }

    if (options.collectionId) {
        filesQuery = filesQuery.eq('collection_id', options.collectionId)
    } else {
        filesQuery = filesQuery.is('collection_id', null)
    }

    const { data, count, error } = await filesQuery
        .order('title')
        .range(from, to)
    if (error) throw new Error(error.message)

    const files = ((data ?? []) as KnowledgeFileRow[]).map((file) => ({
        id: file.id,
        title: file.title,
        type: file.type
    })) as SidebarFile[]
    const totalCount = normalizeExactCount(count)
    const nextOffset = from + files.length

    return {
        files,
        totalCount,
        nextOffset,
        hasMore: nextOffset < totalCount,
        pageSize: limit
    }
}

function listToTree(collections: KnowledgeCollection[], countMap: Map<string, number>): SidebarCollection[] {
    return collections.map(col => {
        const count = countMap.get(col.id) || 0
        return {
            ...col,
            files: [],
            count,
            loadedFileCount: 0,
            hasMoreFiles: count > 0
        }
    })
}

async function scanKnowledgeDocumentCollectionIds(
    supabase: SupabaseClientLike,
    organizationId?: string | null
): Promise<KnowledgeCountRow[]> {
    const rows: KnowledgeCountRow[] = []
    let offset = 0

    while (true) {
        let countsQuery = supabase
            .from('knowledge_documents')
            .select('collection_id')
        if (organizationId) {
            countsQuery = countsQuery.eq('organization_id', organizationId)
        }

        const { data, error } = await countsQuery
            .order('created_at', { ascending: true })
            .range(offset, offset + COUNT_SCAN_PAGE_SIZE - 1)
        if (error) throw new Error(error.message)

        const page = (data ?? []) as KnowledgeCountRow[]
        rows.push(...page)
        if (page.length < COUNT_SCAN_PAGE_SIZE) break
        offset += page.length
    }

    return rows
}

const KEYWORD_STOPWORDS = new Set([
    'nedir',
    'ne',
    'neye',
    'neden',
    'nasıl',
    'hangi',
    'kaç',
    'zaman',
    'kim',
    'kimlerden',
    'nereye',
    'nerede',
    'nereden',
    'mı',
    'mi',
    'mu',
    'mü',
    'miyim',
    'miyiz',
    'misin',
    'musun',
    'müsün',
    'olabilir',
    'olmadan',
    'vermeden',
    'girmeden',
    'giremez',
    'giremem',
    'girebilir',
    'acaba',
    'lütfen',
    'lutfen',
    'bulabilir',
    'göster',
    'goster',
    'gösterir',
    'gosterir',
    'okuyabilirim',
    'sayfa',
    'sayfasi',
    'sayfası',
    'bilgi',
    'bilgileri',
    'bilgilerini',
    'var',
    'vardır',
    'vardir',
    'hakkında',
    'hakkinda',
    'hakkındaki',
    'hakkindaki',
    'üniversite',
    'universite',
    'üniversitenin',
    'universitenin',
    'oluşuyor',
    'olusuyor',
    'ücret',
    'fiyat',
    'randevu',
    'iptal',
    'iade',
    'kampanya',
    'indirim',
    'paket',
    'süre',
    'saat',
    'gün',
    'policy',
    'price',
    'pricing',
    'when',
    'what',
    'why',
    'who',
    'how',
    'which'
])

const TURKISH_SEARCH_CHAR_MAP: Record<string, string> = {
    'ı': 'i',
    'İ': 'i',
    'ğ': 'g',
    'Ğ': 'g',
    'ü': 'u',
    'Ü': 'u',
    'ş': 's',
    'Ş': 's',
    'ö': 'o',
    'Ö': 'o',
    'ç': 'c',
    'Ç': 'c'
}

function normalizeSearchText(value: string): string {
    return value
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_SEARCH_CHAR_MAP[char] ?? char)
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .toLowerCase()
}

function stemSearchToken(token: string): string {
    const normalized = normalizeSearchText(token)

    if (normalized.endsWith('igi') && normalized.length > 5) {
        return `${normalized.slice(0, -3)}ik`
    }

    const suffixes = [
        'lerinin',
        'larinin',
        'lerini',
        'larini',
        'sinin',
        'sini',
        'sina',
        'sine',
        'ini',
        'ina',
        'ine',
        'in',
        'un',
        'nin',
        'imiz',
        'imizle',
        'miz',
        'leri',
        'lari',
        'ler',
        'lar',
        'si',
        'su'
    ]

    for (const suffix of suffixes) {
        if (normalized.endsWith(suffix) && normalized.length - suffix.length >= 4) {
            return normalized.slice(0, -suffix.length)
        }
    }

    return normalized
}

function isKeywordStopword(token: string) {
    const normalized = normalizeSearchText(token)
    const stemmed = stemSearchToken(normalized)

    return KEYWORD_STOPWORDS.has(token)
        || KEYWORD_STOPWORDS.has(normalized)
        || KEYWORD_STOPWORDS.has(stemmed)
}

function extractKeywordTokens(query: string): string[] {
    const normalized = query
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()

    if (!normalized) return []

    const tokens = normalized.split(/\s+/).filter(Boolean)
    const keywords = tokens.filter(token => token.length >= 3 && !isKeywordStopword(token))
    const unique = Array.from(new Set(keywords))

    if (unique.length > 0) {
        return unique.slice(0, 5)
    }

    return Array.from(new Set(tokens.filter(token => token.length >= 3))).slice(0, 5)
}

function sanitizeKeyword(keyword: string): string {
    return keyword.replace(/[%_]/g, '')
}

function sanitizeIlikePattern(value: string): string {
    return value.replace(/[%_]/g, '')
}

function expandKeywordToken(token: string): string[] {
    const normalized = normalizeSearchText(token)
    const stemmed = stemSearchToken(normalized)
    const variants = new Set([token, normalized, stemmed])

    if (normalized.endsWith('lari') || normalized.endsWith('leri')) {
        variants.add(normalized.slice(0, -1))
    }
    if (normalized.endsWith('si') || normalized.endsWith('su')) {
        variants.add(normalized.slice(0, -2))
    }

    return [...variants]
        .map(sanitizeKeyword)
        .filter((value) => value.length >= 3)
}

function keywordGroups(query: string): string[][] {
    return extractKeywordTokens(query)
        .map(expandKeywordToken)
        .filter((group) => group.length > 0)
}

function normalizedTokenSet(value: string) {
    const normalized = normalizeSearchText(value)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()
    const tokenSet = new Set<string>()
    if (!normalized) return tokenSet

    for (const token of normalized.split(/\s+/)) {
        if (!token) continue
        tokenSet.add(token)
        tokenSet.add(stemSearchToken(token))
    }

    return tokenSet
}

function keywordGroupMatchesValue(group: string[], value: string, tokenSet: Set<string>) {
    const haystack = normalizeSearchText(value)

    return group.some((keyword) => {
        const normalized = normalizeSearchText(keyword).trim()
        if (!normalized) return false

        if (normalized.includes(' ')) {
            return haystack.includes(normalized)
        }

        const stemmed = stemSearchToken(normalized)
        if (tokenSet.has(normalized) || tokenSet.has(stemmed)) return true

        // Long variants can legitimately appear inside inflected forms or URL slugs.
        // Short Turkish words such as "izin" must stay token-bound so "sizin" cannot match.
        return normalized.length >= 5 && haystack.includes(normalized)
    })
}

function lexicalMatchScore(query: string, value: string) {
    const groups = keywordGroups(query)
    if (groups.length === 0) return 0

    const tokenSet = normalizedTokenSet(value)
    const hits = groups.filter((group) => {
        return keywordGroupMatchesValue(group, value, tokenSet)
    }).length

    return hits / groups.length
}

function allMeaningfulSearchTokens(value: string) {
    const normalized = value
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()

    if (!normalized) return []

    const tokens = normalized
        .split(/\s+/)
        .map(stemSearchToken)
        .filter((token) => token.length >= 3 && !isKeywordStopword(token))

    return Array.from(new Set(tokens))
}

const DOCUMENT_TITLE_QUERY_STOPWORDS = new Set([
    'amac',
    'amaci',
    'kapsam',
    'kapsami',
    'kapsiyor',
    'kapsar',
    'duzenler',
    'duzenleme',
    'dokuman',
    'belge',
    'numara',
    'numarasi',
    'karar',
    'karari',
    'senato',
    'kabul',
    'edildi',
    'gecerli'
])

function documentTitleQueryTokens(query: string) {
    return allMeaningfulSearchTokens(query)
        .filter((token) => !DOCUMENT_TITLE_QUERY_STOPWORDS.has(token))
}

function documentTitleCoverageScore(query: string, title?: string | null) {
    if (!hasQuerySignal(query, ['dokuman', 'doküman', 'belge', 'mevzuat', 'numara', 'no'])
        && !hasDirectiveWord(query)
        && !hasRegulationWord(query)) {
        return 0
    }
    if (!title) return 0

    const queryTokenList = documentTitleQueryTokens(query)
    const queryTokens = new Set(queryTokenList)
    const titleTokens = allMeaningfulSearchTokens(title)
    if (queryTokens.size === 0 || titleTokens.length === 0) return 0

    const hits = titleTokens.filter((token) => queryTokens.has(token)).length
    const titleCoverage = hits / titleTokens.length
    const queryCoverage = hits / queryTokenList.length
    if (queryTokenList.length >= 4 && queryCoverage < 0.55) return 0
    if (titleCoverage < 0.72 && queryCoverage < 0.72) return 0

    const extraTitleTokenCount = titleTokens.length - hits
    return Math.max(0, titleCoverage * 0.18 + queryCoverage * 0.18 - extraTitleTokenCount * 0.03)
}

interface DocumentCodeCandidate {
    raw: string
    normalized: string
    compact: string
    prefix: string
}

function compactSearchText(value: string) {
    return normalizeSearchText(value).replace(/[^\p{L}\p{N}]+/gu, '')
}

function extractDocumentCodeCandidates(query: string): DocumentCodeCandidate[] {
    const matches = query.match(/[\p{L}\p{N}]{2,10}(?:[.-][\p{L}\p{N}]{2,10}){2,}/gu) ?? []
    const seen = new Set<string>()

    return matches
        .map((raw) => {
            const normalized = normalizeSearchText(raw).replace(/\s+/g, '')
            const compact = compactSearchText(raw)
            const prefix = normalizeSearchText(raw.split(/[.-]/)[0] ?? '')

            return {
                raw,
                normalized,
                compact,
                prefix
            }
        })
        .filter((candidate) => {
            if (!candidate.compact || seen.has(candidate.compact)) return false
            seen.add(candidate.compact)
            return true
        })
}

function hasDocumentNumberQuestionSignal(query: string) {
    return hasQuerySignal(query, [
        'dokuman numarasi',
        'doküman numarası',
        'dokuman no',
        'doküman no',
        'belge numarasi',
        'belge numarası'
    ])
}

function hasExtractableDocumentNumber(value: string) {
    const normalized = normalizeSearchText(value)

    return /dokuman\s+no\s+[\p{L}\p{N}]{2,10}[.-][\p{L}\p{N}]{2,10}[.-][\p{L}\p{N}]{2,10}/u.test(normalized)
}

function isGenericDocumentControlTitle(title: string) {
    const normalized = normalizeSearchText(title)

    return normalized.includes('dokuman hazirlama')
        || normalized.includes('dokuman kontrol')
        || normalized.includes('dokuman hazirlama ve kontrol')
}

function documentCodeLookupScore(query: string, result: KnowledgeSearchResult) {
    const candidates = extractDocumentCodeCandidates(query)
    const sourceUrl = sourceUrlFromResult(result) ?? ''
    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const searchableCompact = compactSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    let score = 0

    for (const candidate of candidates) {
        const hasExactCode = searchable.includes(candidate.normalized)
            || searchableCompact.includes(candidate.compact)
        const hasLooseSuffixOnly = candidate.compact.length > candidate.prefix.length
            && !hasExactCode
            && searchableCompact.includes(candidate.compact.slice(candidate.prefix.length))

        if (hasExactCode) {
            score += 0.9
            if (hasDirectiveWord(title) || hasRegulationWord(title)) score += 0.14
            if (searchable.includes('dokuman no')) score += 0.08
        } else if (hasLooseSuffixOnly) {
            score -= 0.28
        }
    }

    if (candidates.length > 0 && isGenericDocumentControlTitle(result.document_title ?? '')) {
        const hasAnyExactCode = candidates.some((candidate) => searchableCompact.includes(candidate.compact))
        if (!hasAnyExactCode) score -= 0.42
    }

    if (hasDocumentNumberQuestionSignal(query)) {
        const hasDocumentNumber = hasExtractableDocumentNumber(`${result.document_title}\n${result.content}`)
        if (hasDocumentNumber) {
            score += 0.44
            if (sourceUrl.toLowerCase().includes('.pdf')) score += 0.08
        } else {
            score -= 0.14
        }
    }

    return score
}

interface AbbreviationCandidate {
    raw: string
    normalized: string
    compact: string
}

function uppercaseLetterCount(value: string) {
    return (value.match(/\p{Lu}/gu) ?? []).length
}

function extractAbbreviationCandidates(query: string): AbbreviationCandidate[] {
    if (extractDocumentCodeCandidates(query).length > 0) return []

    const hasAbbreviationSignal = hasQuerySignal(query, [
        'kisaltma',
        'kısaltma',
        'acilim',
        'açılım',
        'neyi ifade',
        'ne anlama',
        'ne demek'
    ])
    const rawTokens = query.match(/[\p{L}\p{N}]{2,8}(?:-[\p{L}\p{N}]{2,8})?/gu) ?? []
    const candidates: AbbreviationCandidate[] = []
    const seen = new Set<string>()

    for (const raw of rawTokens) {
        const normalized = normalizeSearchText(raw)
        const compact = compactSearchText(raw)
        const letterCount = (raw.match(/\p{L}/gu) ?? []).length
        const uppercaseLike = uppercaseLetterCount(raw) >= Math.min(2, letterCount)
        const allowSignalToken = hasAbbreviationSignal && candidates.length === 0 && compact.length >= 2 && compact.length <= 4

        if (compact.length < 2 || compact.length > 12) continue
        if (isKeywordStopword(normalized) || KEYWORD_STOPWORDS.has(compact)) continue
        if (!uppercaseLike && !allowSignalToken) continue
        if (seen.has(compact)) continue

        seen.add(compact)
        candidates.push({
            raw,
            normalized,
            compact
        })
    }

    return candidates
}

function containsAbbreviationCandidate(value: string, candidate: AbbreviationCandidate) {
    const normalized = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)
    const compactValue = compactSearchText(value)

    if (candidate.normalized.includes('-')) {
        return normalized.includes(candidate.normalized)
            || compactValue.includes(candidate.compact)
    }

    if (candidate.compact.length <= 4) {
        return tokenSet.has(candidate.normalized)
    }

    return tokenSet.has(candidate.normalized)
        || normalized.includes(candidate.normalized)
        || compactValue.includes(candidate.compact)
}

function abbreviationLookupScore(query: string, result: KnowledgeSearchResult) {
    const candidates = extractAbbreviationCandidates(query)
    if (candidates.length === 0) return 0

    const sourceUrl = sourceUrlFromResult(result) ?? ''
    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    let score = 0

    for (const candidate of candidates) {
        const appearsInSearchable = containsAbbreviationCandidate(searchable, candidate)
        const appearsInTitle = containsAbbreviationCandidate(result.document_title ?? '', candidate)
        const appearsInSource = containsAbbreviationCandidate(sourceUrl, candidate)

        if (appearsInSearchable) score += 0.36
        if (appearsInTitle) score += 0.18
        if (appearsInSource) score += 0.12
        if (appearsInSearchable && normalizeSearchText(searchable).includes(`(${candidate.normalized})`)) score += 0.24

        if (!appearsInSearchable) {
            score -= 0.16
        }
    }

    if (hasQuerySignal(query, ['kisaltma', 'kısaltma', 'neyi ifade', 'ifade ediyor'])
        && normalizeSearchText(result.content).includes('ifade')) {
        score += 0.1
    }

    if (hasQuerySignal(query, ['birim', 'birimi', 'neyi ifade', 'ifade ediyor'])
        && normalizeSearchText(searchable).includes('daire baskanligi')) {
        score += 0.22
    }

    if (isGenericDocumentControlTitle(result.document_title ?? '')) {
        score -= 0.24
    }

    if (hasQuerySignal(query, ['tip fakultesi', 'tıp fakültesi'])
        && title.includes('tip fakultesi')) {
        score += 0.08
    }

    return score
}

function abbreviationInitialismScore(query: string, title?: string | null) {
    const candidates = extractAbbreviationCandidates(query)
    if (candidates.length === 0 || !title) return 0

    const titleTokens = allMeaningfulSearchTokens(title)
    if (titleTokens.length === 0) return 0

    let score = 0

    for (const candidate of candidates) {
        if (!/^[a-z]{2,6}$/.test(candidate.compact)) continue

        for (let start = 0; start <= titleTokens.length - candidate.compact.length; start += 1) {
            const initials = titleTokens
                .slice(start, start + candidate.compact.length)
                .map((token) => token[0] ?? '')
                .join('')

            if (initials === candidate.compact) {
                score += start === 0 ? 0.58 : 0.44
                break
            }
        }
    }

    return score
}

function directiveDetailScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!hasDirectiveWord(query) && !hasRegulationWord(query)) return 0

    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const asksDirective = hasDirectiveWord(query)
    const asksRegulation = hasRegulationWord(query)
    const titleIsDirective = hasDirectiveWord(title)
    const titleIsRegulation = hasRegulationWord(title)
    const titleCoverage = documentTitleCoverageScore(query, result.document_title)
    let score = 0

    if ((asksDirective && titleIsDirective) || (asksRegulation && titleIsRegulation)) {
        score += 0.42
        if (titleCoverage > 0) score += 0.5 + titleCoverage
        if (sourceUrl.toLowerCase().includes('.pdf')) score += 0.12
    } else if ((asksDirective || asksRegulation) && !titleIsDirective && !titleIsRegulation) {
        score -= 0.9
        if (!sourceUrl.toLowerCase().includes('.pdf')) score -= 0.24
    }

    if (hasQuerySignal(query, ['hazirlik', 'hazırlık']) && searchable.includes('hazirlik')) {
        score += 0.22
    }

    if (hasQuerySignal(query, ['yararlanabilir', 'yararlanabilir mi', 'yararlanamaz'])
        && (searchable.includes('yararlanamaz') || searchable.includes('yararlanabilir'))) {
        score += 0.18
    }

    if (hasQuerySignal(query, ['program'])
        && searchable.includes('program')) {
        score += 0.06
    }

    return score
}

const SOURCE_SLUG_CONNECTORS = new Set(['ve', 'and', 'ile'])
const SOURCE_SLUG_STOPWORDS = new Set([
    'sayfasinda',
    'sayfada',
    'sayfanin',
    'sayfaya',
    'icin',
    'midir',
    'mi',
    'mı',
    'hedefliyor',
    'yetistirmeyi'
])

function hasSpecificContactSubjectSignal(query: string) {
    return hasQuerySignal(query, [
        'koordinatorluk',
        'koordinatörlük',
        'koordinatorlugu',
        'koordinatörlüğü',
        'mudurluk',
        'müdürlük',
        'mudurlugu',
        'müdürlüğü',
        'birim',
        'birimi',
        'sekreterlik',
        'dekanlik',
        'dekanlık',
        'fakulte',
        'fakülte',
        'fakultesi',
        'fakültesi',
        'yuksekokul',
        'yüksekokul',
        'yuksekokulu',
        'yüksekokulu',
        'enstitu',
        'enstitü',
        'ogrenci isleri',
        'öğrenci işleri',
        'erasmus'
    ])
}

function sourceSlugTokenSequence(query: string) {
    const normalized = normalizeSearchText(query)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()

    if (!normalized) return []

    return normalized
        .split(/\s+/)
        .filter((token) => {
            if (SOURCE_SLUG_CONNECTORS.has(token)) return true
            return token.length >= 3 && !SOURCE_SLUG_STOPWORDS.has(token) && !isKeywordStopword(token)
        })
        .map((token) => SOURCE_SLUG_CONNECTORS.has(token) ? token : stemSearchToken(token))
}

function sourceSlugCandidates(query: string) {
    const tokens = sourceSlugTokenSequence(query)
    const priorityCandidates = new Set<string>()
    const candidates = new Set<string>()

    if (hasQuerySignal(query, ['aday ogrenci', 'aday öğrenci'])) {
        priorityCandidates.add('aday-ogrenci')
    }

    const genericContactQuery = hasQuerySignal(query, ['iletisim', 'iletişim', 'ulasim', 'ulaşım', 'adres', 'telefon'])
        && !hasSpecificContactSubjectSignal(query)
    const rectorateContactQuery = hasQuerySignal(query, ['rektor', 'rektör', 'rektorluk', 'rektörlük'])
        && hasQuerySignal(query, ['iletisim', 'iletişim', 'telefon', 'adres'])
    if (genericContactQuery || rectorateContactQuery) {
        priorityCandidates.add('/iletisim')
    }

    if (hasQuerySignal(query, ['isg', 'is sagligi', 'iş sağlığı'])
        && hasQuerySignal(query, ['koordinator', 'koordinatör', 'koordinatoru', 'koordinatörü', 'koordinatorluk', 'koordinatörlük'])) {
        priorityCandidates.add('is-sagligi-ve-guvenligi-koordinatorlugu')
    }

    tokens.forEach((token, index) => {
        if (token !== 'bolum' && token !== 'bolumu') return

        for (let start = Math.max(0, index - 4); start < index; start += 1) {
            const slice = tokens.slice(start, index + 1)
            const meaningfulTokenCount = slice.filter((item) => !SOURCE_SLUG_CONNECTORS.has(item)).length
            if (meaningfulTokenCount >= 2) {
                priorityCandidates.add(slice.join('-'))
            }
        }
    })

    for (let index = 1; index < tokens.length; index += 1) {
        if (tokens[index - 1] === 'aday' && tokens[index] === 'ogrenci') {
            priorityCandidates.add('aday-ogrenci')
        }
    }

    for (let size = Math.min(5, tokens.length); size >= 2; size -= 1) {
        for (let start = 0; start <= tokens.length - size; start += 1) {
            const slice = tokens.slice(start, start + size)
            const meaningfulTokenCount = slice.filter((token) => !SOURCE_SLUG_CONNECTORS.has(token)).length
            if (meaningfulTokenCount < 2) continue

            candidates.add(slice.join('-'))
        }
    }

    return [...candidates]
        .filter((candidate) => candidate.length >= 5)
        .sort((left, right) => right.length - left.length)
        .reduce<string[]>((items, candidate) => {
            if (!priorityCandidates.has(candidate)) items.push(candidate)
            return items
        }, [...priorityCandidates])
        .filter((candidate) => candidate.length >= 5)
        .slice(0, 6)
}

function shouldUseSourcePathFallback(query: string) {
    return hasQuerySignal(query, [
        'sayfa',
        'sayfasi',
        'sayfası',
        'link',
        'nerede',
        'aday ogrenci',
        'aday öğrenci',
        'bolum',
        'bölüm',
        'bolumu',
        'bölümü',
        'akademik takvim',
        'iletisim',
        'iletişim',
        'koordinator',
        'koordinatör',
        'koordinatoru',
        'koordinatörü',
        'koordinatorluk',
        'koordinatörlük',
        'isg',
        'is sagligi',
        'iş sağlığı',
        'yurt',
        'yurtlar'
    ])
}

function normalizedSourcePathSlug(sourceUrl: string) {
    return normalizeSearchText(sourcePath(sourceUrl))
        .replace(/[^\p{L}\p{N}]+/gu, '-')
        .replace(/^-+|-+$/g, '')
}

function sourceSlugMatchScore(query: string, sourceUrl: string) {
    const pathSlug = normalizedSourcePathSlug(sourceUrl)
    if (!pathSlug) return 0

    return sourceSlugCandidates(query).reduce((bestScore, candidate) => {
        if (!pathSlug.includes(candidate)) return bestScore

        const meaningfulTokenCount = candidate
            .split('-')
            .filter((token) => !SOURCE_SLUG_CONNECTORS.has(token)).length

        return Math.max(bestScore, Math.min(1, meaningfulTokenCount / 3))
    }, 0)
}

function extractSourceUrlFromContent(content: string) {
    return content.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim() ?? ''
}

function sourceUrlFromResult(result: KnowledgeSearchResult) {
    return result.source_url ?? (extractSourceUrlFromContent(result.content) || null)
}

function sourcePath(sourceUrl: string) {
    try {
        return new URL(sourceUrl).pathname
    } catch {
        return sourceUrl
    }
}

function hasQuerySignal(query: string, signals: string[]) {
    const normalized = normalizeSearchText(query)
    return signals.some((signal) => normalized.includes(normalizeSearchText(signal)))
}

function hasDirectiveWord(value: string) {
    return normalizeSearchText(value).includes('yonerge')
}

function hasRegulationWord(value: string) {
    const normalized = normalizeSearchText(value)

    return normalized.includes('yonetmelik')
        || normalized.includes('yonetmeligi')
        || normalized.includes('yonetmeligin')
}

function isTimeSensitiveQuery(query: string) {
    return hasQuerySignal(query, [
        'duyuru',
        'sonuc',
        'sonuç',
        'basladi',
        'başladı',
        'guncel',
        'güncel',
        'ilan',
        'sinav',
        'sınav',
        'yerlestirme',
        'yerleştirme',
        '2024',
        '2025',
        '2026'
    ])
}

function isEvergreenPath(pathname: string) {
    return pathname.startsWith('/sayfa/')
        || pathname === '/iletisim'
        || pathname === '/aday-ogrenci'
        || pathname === '/obs'
        || pathname === '/akademik-takvim'
}

function isTransientPath(pathname: string) {
    return pathname.startsWith('/duyuru/')
        || pathname.startsWith('/haber/')
        || pathname.startsWith('/etkinlik/')
}

function pageTypeScore(query: string, sourceUrl: string) {
    const pathname = sourcePath(sourceUrl)
    const timeSensitive = isTimeSensitiveQuery(query)
    const departmentPageQuery = hasQuerySignal(query, ['bolum', 'bölüm', 'bolumu', 'bölümü'])
        && hasQuerySignal(query, ['sayfa', 'sayfasi', 'sayfası', 'hakkinda', 'hakkında', 'ders program'])
    let score = 0

    if (isEvergreenPath(pathname)) {
        score += timeSensitive ? 0.02 : 0.1
    }

    if (isTransientPath(pathname) && !timeSensitive) {
        score -= departmentPageQuery ? 0.3 : 0.14
    }

    return score
}

function directIntentScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    const pathname = normalizeSearchText(sourcePath(sourceUrl))
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const title = normalizeSearchText(result.document_title ?? '')
    const sourceSlugScore = sourceSlugMatchScore(query, sourceUrl)
    let score = 0
    const hasSpecificContactSubject = hasSpecificContactSubjectSignal(query)

    if (hasQuerySignal(query, ['iletisim', 'iletişim', 'ulasim', 'ulaşım', 'adres', 'telefon'])
        && (pathname.includes('iletisim') || pathname.includes('ulasim'))
        && (!hasSpecificContactSubject || lexicalMatchScore(query, `${result.document_title}\n${sourceUrl}`) >= 0.5)) {
        score += 0.18
    }

    if (hasQuerySignal(query, ['iletisim', 'iletişim', 'ulasim', 'ulaşım', 'adres', 'telefon'])
        && !hasSpecificContactSubject
        && sourcePath(sourceUrl) === '/iletisim') {
        score += 0.28
    }

    if (hasQuerySignal(query, ['rektor', 'rektör', 'rektorluk', 'rektörlük'])
        && hasQuerySignal(query, ['iletisim', 'iletişim', 'telefon', 'adres'])
        && sourcePath(sourceUrl) === '/iletisim') {
        score += 0.32
    }

    if (hasQuerySignal(query, ['isg', 'is sagligi', 'iş sağlığı'])
        && hasQuerySignal(query, ['koordinator', 'koordinatör', 'koordinatoru', 'koordinatörü', 'koordinatorluk', 'koordinatörlük'])
        && sourcePath(sourceUrl).startsWith('/sayfa/')
        && pathname.includes('is-sagligi-ve-guvenligi-koordinatorlugu')) {
        score += 0.42
    }

    if (hasQuerySignal(query, ['aday ogrenci', 'aday öğrenci'])
        && pathname === '/aday-ogrenci') {
        score += 0.36
    }

    if (hasQuerySignal(query, ['tarihce', 'tarihçe'])
        && searchable.includes('tarihce')) {
        score += 0.18
    }

    if (hasQuerySignal(query, ['akademik takvim'])) {
        const hasSpecificCalendarSubject = hasQuerySignal(query, [
            'tip fakultesi',
            'tıp fakültesi',
            'saglik bilimleri',
            'sağlık bilimleri',
            'spor bilimleri',
            'lisansustu',
            'lisansüstü',
            'enstitu',
            'enstitü',
            '2024',
            '2025',
            '2026'
        ])
        if (pathname === '/akademik-takvim' && !hasSpecificCalendarSubject) {
            score += 0.32
        } else if (pathname.endsWith('/akademik-takvim')) {
            score += hasSpecificCalendarSubject ? 0.16 : 0.06
        }
    }

    if (hasQuerySignal(query, ['yurt', 'yurtlar', 'yurtlari', 'yurtları'])
        && pathname.includes('/yurtlar/')) {
        score += 0.24
    }

    if (hasQuerySignal(query, ['akademik kadro'])
        && pathname.includes('akademik-kadro')) {
        score += 0.22
    }

    if (hasQuerySignal(query, ['bolum', 'bölüm', 'bolumu', 'bölümü'])
        && pathname.includes('/bolum/')) {
        score += 0.08
    }

    if (sourceSlugScore >= 0.8) {
        score += pathname.includes('/bolum/') ? 0.18 : 0.1
    }

    if (hasQuerySignal(query, ['yonerge', 'yönerge'])
        && title.includes('yonerge')) {
        score += 0.14
    }

    if (hasRegulationWord(query)
        && hasRegulationWord(title)) {
        score += 0.14
    }

    if (hasQuerySignal(query, ['on lisans', 'ön lisans'])
        && (title.includes('on lisans') || searchable.includes('on lisans'))) {
        score += 0.16
    }

    if (hasQuerySignal(query, ['senato karari', 'senato kararı'])
        && searchable.includes('senato')) {
        score += 0.12
    }

    if (hasQuerySignal(query, ['akts'])
        && searchable.includes('akts')) {
        score += 0.16
    }

    if (hasQuerySignal(query, ['kapsam'])
        && searchable.includes('kapsam')) {
        score += 0.08
    }

    return score
}

function isContactInfoQuery(query: string) {
    return hasQuerySignal(query, [
        'iletisim',
        'iletişim',
        'telefon',
        'e posta',
        'e-posta',
        'email',
        'mail',
        'dahili',
        'adres'
    ])
}

function hasConcreteContactValue(value: string) {
    return /(?:\+?\s*90|0\s*312|\b312\b|444\s*9\s*844|\bdahili\b|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})/i.test(value)
}

function rootContactInformationScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isContactInfoQuery(query)) return 0
    if (sourcePath(sourceUrl) !== '/iletisim') return 0

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    if (!hasConcreteContactValue(searchable)) return 0

    const contentScore = lexicalMatchScore(query, `${result.document_title}\n${result.content}`)
    if (contentScore < 0.42) return 0

    return 0.42 + contentScore * 0.28
}

function isHealthReportExcuseExamQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('rapor')
        && normalized.includes('mazeret')
        && (normalized.includes('sinav') || normalized.includes('gire'))
}

function healthReportExamPolicyScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isHealthReportExcuseExamQuery(query)) return 0

    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const hasPolicyDocumentSignal = title.includes('yonetmel') || title.includes('yonerge')
    const hasRuleEvidence = searchable.includes('belgelendirm')
        || searchable.includes('yonetim kurulu')
        || searchable.includes('gecersiz sayilir')
        || searchable.includes('raporlu ogrenci')
    const hasCalendarNoticeSignal = searchable.includes('takvim')
        || searchable.includes('ogrenci listesi')
        || searchable.includes('yayinlanmistir')
        || searchable.includes('yayimlanmistir')
        || sourcePath(sourceUrl).startsWith('/duyuru/')

    let score = 0

    if (searchable.includes('saglik raporu')) score += 0.16
    if (hasPolicyDocumentSignal && searchable.includes('sinav')) score += 0.18
    if (searchable.includes('belgelendirm')) score += 0.18
    if (searchable.includes('yonetim kurulu')) score += 0.14
    if (searchable.includes('gecersiz sayilir')) score += 0.18
    if (searchable.includes('raporlu ogrenci') && searchable.includes('sinavlara giremez')) score += 0.18

    if (hasCalendarNoticeSignal && !hasRuleEvidence) {
        score -= 0.36
    }

    return score
}

const POLICY_DURATION_SUBJECT_STOPWORDS = new Set([
    'sure',
    'suresi',
    'kadar',
    'kac',
    'azami',
    'fazla',
    'cok',
    'gec',
    'nedir',
    'gun',
    'gunu',
    'hafta',
    'ay',
    'yil',
    'saat',
    'dakika'
])
const POLICY_DURATION_ACTOR_TOKENS = new Set([
    'aday',
    'akademik',
    'calisan',
    'idari',
    'ogrenci',
    'personel'
])
const POLICY_DURATION_GENERIC_SUBJECT_TOKENS = new Set([
    'basvuru',
    'egitim',
    'izin',
    'muafiyet',
    'rapor',
    'sinav',
    'staj'
])
const POLICY_DURATION_VALUE_PATTERN = [
    '\\d+',
    'bir',
    'iki',
    'uc',
    'dort',
    'bes',
    'alti',
    'yedi',
    'sekiz',
    'dokuz',
    'on',
    'on\\s+bes',
    'yirmi',
    'otuz'
].join('|')
const POLICY_DURATION_UNIT_PATTERN = '(?:is\\s+gunu|gunu|gun|hafta|ay|yil|saat|dakika)(?:dur|dir|tir)?'
const POLICY_DURATION_VALUE_REGEX = new RegExp(`\\b(?:${POLICY_DURATION_VALUE_PATTERN})\\s+(?:\\([^)]*\\)\\s*)?${POLICY_DURATION_UNIT_PATTERN}\\b`, 'iu')

function isPolicyDurationQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('sure')
        || normalized.includes('suresi')
        || normalized.includes('azami')
        || normalized.includes('en fazla')
        || normalized.includes('en cok')
        || /\b(?:kac|ne kadar)\s+(?:is\s+gunu|gun|hafta|ay|yil|saat|dakika)\b/i.test(normalized)
        || normalized.includes('ne kadar')
            && hasQuerySignal(normalized, ['izin', 'rapor', 'sinav', 'basvuru', 'staj', 'egitim', 'muafiyet'])
}

function policyDurationSubjectKeywordGroups(query: string) {
    const requiredTokens = policyDurationRequiredSubjectTokens(policyDurationSubjectTokens(query))
    if (requiredTokens.length === 0) return []

    const keywordTokens = extractKeywordTokens(query)
    return requiredTokens
        .map((requiredToken) => {
            const sourceToken = keywordTokens.find((keyword) => {
                const normalized = normalizeSearchText(keyword)
                return normalized === requiredToken || stemSearchToken(normalized) === requiredToken
            }) ?? requiredToken

            return expandKeywordToken(sourceToken)
        })
        .filter((group) => group.length > 0)
        .slice(0, 3)
}

function policyDurationEvidenceFilters(subjectGroups: string[][]) {
    const durationKeywords = [
        'gün',
        'gun',
        'iş günü',
        'is gunu',
        'hafta',
        'ay',
        'yıl',
        'yil',
        'saat',
        'dakika',
        'en fazla',
        'azami'
    ].map(sanitizeKeyword)

    const subjectCombinations = subjectGroups.reduce<string[][]>((combinations, group) => {
        const variants = Array.from(new Set(group.map(sanitizeKeyword)))
            .filter((keyword) => keyword.length >= 3)
            .slice(0, 4)

        if (variants.length === 0) return combinations
        if (combinations.length === 0) return variants.map((variant) => [variant])

        return combinations.flatMap((combination) => (
            variants.map((variant) => [...combination, variant])
        ))
    }, [])

    return subjectCombinations
        .slice(0, 24)
        .flatMap((subjects) => durationKeywords.map((durationKeyword) => {
            const filters = [
                ...subjects.map((subject) => `content.ilike.%${subject}%`),
                `content.ilike.%${durationKeyword}%`
            ]

            return `and(${filters.join(',')})`
        }))
        .join(',')
}

async function searchKnowledgeBaseByPolicyDurationEvidence(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    if (!isPolicyDurationQuery(query)) return []

    const subjectGroups = policyDurationSubjectKeywordGroups(query)
    if (subjectGroups.length === 0) return []

    const supabase = options?.supabase || await createClient()
    const filters = policyDurationEvidenceFilters(subjectGroups)
    if (!filters) return []

    let policyQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .or(filters)

    if (options?.collectionId) {
        policyQuery = policyQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        policyQuery = policyQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        policyQuery = policyQuery.eq('knowledge_documents.language', options.language)
    }

    const { data, error } = await policyQuery.limit(Math.max(24, Math.min(80, limit * 3)))
    if (error || !data) {
        console.error('Policy-duration fallback search failed:', error)
        return []
    }

    return (data as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentTitle = row.knowledge_documents?.title ?? 'Untitled'
            const content = row.content as string
            const sourceUrl = extractSourceUrlFromContent(content)
            const result = {
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: documentTitle,
                document_type: row.knowledge_documents?.type ?? 'article',
                content,
                similarity: 0.72
            }
            const durationScore = policyDurationEvidenceScore(query, sourceUrl, result)
            const lexicalScore = lexicalMatchScore(query, `${documentTitle}\n${content}`)

            return {
                ...result,
                similarity: Math.max(0.2, 0.72 + durationScore * 0.18 + lexicalScore * 0.12)
            }
        })
}

function policyDurationSubjectTokens(query: string) {
    return allMeaningfulSearchTokens(query)
        .filter((token) => !POLICY_DURATION_SUBJECT_STOPWORDS.has(token))
        .slice(0, 6)
}

function policyDurationRequiredSubjectTokens(tokens: string[]) {
    return tokens.filter((token) => (
        !POLICY_DURATION_ACTOR_TOKENS.has(token)
        && !POLICY_DURATION_GENERIC_SUBJECT_TOKENS.has(token)
    ))
}

function policyDurationSubjectCoverage(tokens: string[], value: string) {
    if (tokens.length === 0) return 0

    const normalized = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)
    const hits = tokens.filter((token) => tokenSet.has(token) || normalized.includes(token)).length

    return hits / tokens.length
}

function policyDurationHasRequiredSubjectTokens(tokens: string[], value: string) {
    if (tokens.length === 0) return true

    const normalized = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)

    return tokens.every((token) => tokenSet.has(token) || normalized.includes(token))
}

function hasPolicyDurationEvidence(value: string) {
    return POLICY_DURATION_VALUE_REGEX.test(value)
}

function policyDurationEvidenceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isPolicyDurationQuery(query)) return 0

    const subjectTokens = policyDurationSubjectTokens(query)
    if (subjectTokens.length === 0) return 0

    const title = normalizeSearchText(result.document_title ?? '')
    const sourcePathText = normalizeSearchText(sourcePath(sourceUrl))
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const subjectCoverage = policyDurationSubjectCoverage(subjectTokens, searchable)
    const requiredSubjectTokens = policyDurationRequiredSubjectTokens(subjectTokens)
    const hasRequiredSubjectFocus = policyDurationHasRequiredSubjectTokens(requiredSubjectTokens, searchable)
    const hasDurationEvidence = hasPolicyDurationEvidence(searchable)
    const policyDocumentSignal = hasDirectiveWord(title)
        || hasRegulationWord(title)
        || searchable.includes('madde')
        || sourceUrl.toLowerCase().includes('.pdf')
    let score = 0

    if (!hasRequiredSubjectFocus) {
        score -= hasDurationEvidence ? 0.72 : 0.36
    }

    if (hasDurationEvidence && hasRequiredSubjectFocus && subjectCoverage > 0.67) {
        score += 0.42 + subjectCoverage * 0.58
        if (policyDocumentSignal) score += 0.2
        if (searchable.includes('madde')) score += 0.08
        if (sourceUrl.toLowerCase().includes('.pdf')) score += 0.08
    }

    if (hasDurationEvidence
        && hasRequiredSubjectFocus
        && subjectCoverage >= 0.6
        && (searchable.includes('en fazla') || searchable.includes('en gec') || searchable.includes('azami'))) {
        score += 0.18
    }

    if (subjectCoverage < 0.45) {
        score -= 0.34
        if (title.includes('hareketliligi') || sourcePathText.includes('erasmus')) score -= 0.24
    }

    return score
}

function scoreKnowledgeResult(query: string, result: KnowledgeSearchResult) {
    const similarity = Number.isFinite(result.similarity) ? Number(result.similarity) : 0
    const sourceUrl = sourceUrlFromResult(result) ?? ''
    const contentScore = lexicalMatchScore(query, `${result.document_title}\n${result.content}`)
    const titleScore = lexicalMatchScore(query, result.document_title ?? '')
    const titleCoverageScore = documentTitleCoverageScore(query, result.document_title)
    const sourceUrlScore = lexicalMatchScore(query, sourceUrl)
    const sourceSlugScore = sourceSlugMatchScore(query, sourceUrl)

    return similarity * 0.6
        + contentScore * 0.4
        + titleScore * 0.15
        + titleCoverageScore
        + sourceUrlScore * 0.18
        + sourceSlugScore * 0.3
        + pageTypeScore(query, sourceUrl)
        + directIntentScore(query, sourceUrl, result)
        + rootContactInformationScore(query, sourceUrl, result)
        + healthReportExamPolicyScore(query, sourceUrl, result)
        + policyDurationEvidenceScore(query, sourceUrl, result)
        + documentCodeLookupScore(query, result)
        + abbreviationLookupScore(query, result)
        + abbreviationInitialismScore(query, result.document_title)
        + directiveDetailScore(query, sourceUrl, result)
}

function enrichKnowledgeSearchResult(result: KnowledgeSearchResult): KnowledgeSearchResult {
    const sourceUrl = sourceUrlFromResult(result)
    if (!sourceUrl) return result

    return {
        ...result,
        source_url: sourceUrl
    }
}

function mergeSearchResults(
    query: string,
    vectorResults: KnowledgeSearchResult[],
    keywordResults: KnowledgeSearchResult[],
    limit: number
) {
    const byChunk = new Map<string, KnowledgeSearchResult>()

    for (const rawResult of [...vectorResults, ...keywordResults]) {
        const result = enrichKnowledgeSearchResult(rawResult)
        const existing = byChunk.get(result.chunk_id)
        if (!existing || scoreKnowledgeResult(query, result) > scoreKnowledgeResult(query, existing)) {
            byChunk.set(result.chunk_id, result)
        }
    }

    return [...byChunk.values()]
        .sort((left, right) => scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left))
        .slice(0, limit)
}

async function searchKnowledgeBaseByKeyword(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const supabase = options?.supabase || await createClient()
    const keywords = Array.from(new Set(extractKeywordTokens(query).flatMap(expandKeywordToken)))
    if (keywords.length === 0) return []

    const filters = keywords
        .map((keyword) => `content.ilike.%${sanitizeKeyword(keyword)}%`)
        .join(',')

    let fallbackQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .or(filters)
        .limit(limit)

    if (options?.collectionId) {
        fallbackQuery = fallbackQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        fallbackQuery = fallbackQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        fallbackQuery = fallbackQuery.eq('knowledge_documents.language', options.language)
    }

    const { data, error } = await fallbackQuery
    if (error || !data) {
        console.error('Keyword fallback search failed:', error)
        return []
    }

    return (data as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => ({
            chunk_id: row.id as string,
            document_id: row.document_id as string,
            document_title: row.knowledge_documents?.title ?? 'Untitled',
            document_type: row.knowledge_documents?.type ?? 'article',
            content: row.content as string,
            similarity: Math.max(
                0.2,
                0.45 + lexicalMatchScore(query, `${row.knowledge_documents?.title ?? ''}\n${row.content}`) * 0.25
            )
        }))
}

async function searchKnowledgeBaseByDocumentCode(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const candidates = extractDocumentCodeCandidates(query)
    if (candidates.length === 0) return []

    const supabase = options?.supabase || await createClient()
    const filters = Array.from(new Set(candidates.flatMap((candidate) => [
        candidate.raw,
        candidate.normalized
    ])))
        .map(sanitizeIlikePattern)
        .filter((candidate) => candidate.length >= 6)
        .map((candidate) => `content.ilike.%${candidate}%`)
        .join(',')

    if (!filters) return []

    let codeQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .or(filters)
        .limit(Math.max(limit * 2, 24))

    if (options?.collectionId) {
        codeQuery = codeQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        codeQuery = codeQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        codeQuery = codeQuery.eq('knowledge_documents.language', options.language)
    }

    const { data, error } = await codeQuery
    if (error || !data) {
        console.error('Document-code fallback search failed:', error)
        return []
    }

    return (data as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentTitle = row.knowledge_documents?.title ?? 'Untitled'
            const result = {
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: documentTitle,
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content as string,
                similarity: 0.72
            }

            return {
                ...result,
                similarity: Math.max(0.2, 0.72 + Math.max(0, documentCodeLookupScore(query, result)) * 0.12)
            }
        })
}

async function searchKnowledgeBaseByAbbreviation(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const candidates = extractAbbreviationCandidates(query)
    if (candidates.length === 0) return []

    const supabase = options?.supabase || await createClient()
    const filters = Array.from(new Set(candidates.flatMap((candidate) => [
        candidate.raw,
        candidate.normalized
    ])))
        .map(sanitizeIlikePattern)
        .filter((candidate) => candidate.length >= 2)
        .map((candidate) => `content.ilike.%${candidate}%`)
        .join(',')

    if (!filters) return []

    let abbreviationQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .or(filters)
        .limit(Math.max(limit * 3, 32))

    if (options?.collectionId) {
        abbreviationQuery = abbreviationQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        abbreviationQuery = abbreviationQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        abbreviationQuery = abbreviationQuery.eq('knowledge_documents.language', options.language)
    }

    const { data, error } = await abbreviationQuery
    if (error || !data) {
        console.error('Abbreviation fallback search failed:', error)
        return []
    }

    return (data as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentTitle = row.knowledge_documents?.title ?? 'Untitled'
            const result = {
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: documentTitle,
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content as string,
                similarity: 0.6
            }

            return {
                ...result,
                similarity: Math.max(0.2, 0.6 + Math.max(0, abbreviationLookupScore(query, result)) * 0.16)
            }
        })
}

function stripFinalTitlePossessiveSuffix(value: string) {
    const parts = value.trim().split(/\s+/)
    if (parts.length === 0) return value.trim()

    const last = parts[parts.length - 1] ?? ''
    const strippedLast = last
        .replace(/(nin|nın|nun|nün)$/iu, '')
        .replace(/(in|ın|un|ün)$/iu, '')

    if (strippedLast.length >= 4 && strippedLast !== last) {
        parts[parts.length - 1] = strippedLast
    }

    return parts.join(' ').trim()
}

function documentTitlePhraseCandidates(query: string) {
    if (extractAbbreviationCandidates(query).length > 0) return []

    let candidate = query
        .replace(/[?!.]+$/g, '')
        .replace(/\b(?:doküman|dokuman|belge)\s+(?:numarası|numarasi|no(?:su)?)\b[\s\S]*$/iu, '')
        .replace(/\b(?:hangi|nedir|ne|kaç|kac|kim|midir|mi|mı)\b[\s\S]*$/iu, '')
        .replace(/\s+/g, ' ')
        .trim()

    if (!candidate || (!hasDirectiveWord(candidate) && !hasRegulationWord(candidate))) return []

    const candidates = new Set<string>()
    candidates.add(candidate)
    candidate = stripFinalTitlePossessiveSuffix(candidate)
    candidates.add(candidate)

    return [...candidates]
        .map((value) => value.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').trim())
        .filter((value) => value.length >= 8)
        .slice(0, 3)
}

async function searchKnowledgeBaseByExactTitlePhrase(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const candidates = documentTitlePhraseCandidates(query)
    if (candidates.length === 0) return []

    const supabase = options?.supabase || await createClient()
    const titleCandidates = candidates
        .map(sanitizeIlikePattern)
        .filter((candidate) => candidate.length >= 8)

    if (titleCandidates.length === 0) return []

    const hasPostgrestLogicSeparator = titleCandidates.some((candidate) => /[,()]/.test(candidate))
    let documents: TitleSearchDocumentRow[] = []

    if (hasPostgrestLogicSeparator) {
        const documentsById = new Map<string, TitleSearchDocumentRow>()
        for (const candidate of titleCandidates) {
            let documentQuery = supabase
                .from('knowledge_documents')
                .select('id, title, type, status')
                .eq('organization_id', organizationId)
                .eq('status', 'ready')
                .ilike('title', `%${candidate}%`)

            if (options?.collectionId) {
                documentQuery = documentQuery.eq('collection_id', options.collectionId)
            }
            if (options?.type) {
                documentQuery = documentQuery.eq('type', options.type)
            }
            if (options?.language) {
                documentQuery = documentQuery.eq('language', options.language)
            }

            const { data, error: documentError } = await documentQuery.limit(Math.max(20, limit))
            if (documentError || !data) {
                console.error('Exact title phrase document search failed:', documentError)
                continue
            }

            for (const document of data as TitleSearchDocumentRow[]) {
                documentsById.set(document.id, document)
            }
        }
        documents = [...documentsById.values()]
    } else {
        const filters = titleCandidates
            .map((candidate) => `title.ilike.%${candidate}%`)
            .join(',')

        let documentQuery = supabase
            .from('knowledge_documents')
            .select('id, title, type, status')
            .eq('organization_id', organizationId)
            .eq('status', 'ready')

        if (options?.collectionId) {
            documentQuery = documentQuery.eq('collection_id', options.collectionId)
        }
        if (options?.type) {
            documentQuery = documentQuery.eq('type', options.type)
        }
        if (options?.language) {
            documentQuery = documentQuery.eq('language', options.language)
        }

        const { data, error: documentError } = await documentQuery
            .or(filters)
            .limit(Math.max(20, limit))
        if (documentError || !data) {
            console.error('Exact title phrase document search failed:', documentError)
            return []
        }

        documents = data as TitleSearchDocumentRow[]
    }

    const rankedDocuments = documents
        .filter((row) => row.status === 'ready')
        .map((row) => ({
            ...row,
            score: lexicalMatchScore(query, row.title ?? '')
                + documentTitleCoverageScore(query, row.title)
        }))
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(4, Math.min(12, limit)))

    const documentIds = rankedDocuments.map((row) => row.id)
    if (documentIds.length === 0) return []

    const documentById = new Map(rankedDocuments.map((row) => [row.id, row]))
    const { data: chunks, error: chunkError } = await supabase
        .from('knowledge_chunks')
        .select('id, document_id, chunk_index, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .in('document_id', documentIds)
        .order('chunk_index')
        .limit(Math.max(limit * 4, 32))

    if (chunkError || !chunks) {
        console.error('Exact title phrase chunk search failed:', chunkError)
        return []
    }

    return (chunks as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentScore = documentById.get(row.document_id)?.score ?? 0
            const chunkScore = lexicalMatchScore(query, `${row.knowledge_documents?.title ?? ''}\n${row.content}`)
            const earlyChunkBoost = Math.max(0, 0.12 - Number(row.chunk_index ?? 0) * 0.015)

            return {
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: row.knowledge_documents?.title ?? 'Untitled',
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content as string,
                similarity: Math.max(
                    0.2,
                    0.68 + documentScore * 0.18 + chunkScore * 0.18 + earlyChunkBoost
                )
            }
        })
}

const MAX_FOCUSED_KEYWORD_QUERIES = 6

function keywordGroupKey(group: string[]) {
    return group
        .map((keyword) => stemSearchToken(keyword))
        .sort()
        .join('|')
}

function keywordGroupSetsForFocusedSearch(query: string) {
    const groups = keywordGroups(query)
    if (groups.length < 2) return []

    const groupSets: string[][][] = []
    const seen = new Set<string>()
    const addGroupSet = (indexes: number[]) => {
        const selectedGroups = indexes
            .map((index) => groups[index])
            .filter((group): group is string[] => Boolean(group?.length))

        if (selectedGroups.length < 2) return

        const key = selectedGroups.map(keywordGroupKey).join('&&')
        if (seen.has(key)) return
        seen.add(key)
        groupSets.push(selectedGroups)
    }

    for (let index = 0; index < groups.length - 1; index += 1) {
        addGroupSet([index, index + 1])
    }

    for (let index = 0; index < groups.length - 2; index += 1) {
        addGroupSet([index, index + 1, index + 2])
    }

    const acronymIndex = groups.findIndex((group) => {
        return group.some((keyword) => /^[a-z0-9]{2,5}$/.test(normalizeSearchText(keyword)))
    })
    if (acronymIndex >= 0) {
        for (let index = 0; index < groups.length; index += 1) {
            if (index !== acronymIndex) addGroupSet([acronymIndex, index])
        }
    }

    for (let left = 0; left < groups.length - 1; left += 1) {
        for (let right = left + 1; right < groups.length; right += 1) {
            addGroupSet([left, right])
        }
    }

    return groupSets.slice(0, MAX_FOCUSED_KEYWORD_QUERIES)
}

function keywordGroupContentFilter(group: string[]) {
    const filters = Array.from(new Set(group.map(sanitizeKeyword)))
        .filter((keyword) => keyword.length >= 3)
        .map((keyword) => `content.ilike.%${keyword}%`)

    return filters.join(',')
}

async function searchKnowledgeBaseByFocusedKeywords(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const supabase = options?.supabase || await createClient()
    const groupSets = keywordGroupSetsForFocusedSearch(query)
    if (groupSets.length === 0) return []

    const results: KnowledgeSearchResult[] = []
    const seenChunks = new Set<string>()
    const focusedLimit = Math.max(12, Math.min(32, limit))

    for (const groupSet of groupSets) {
        let focusedQuery = supabase
            .from('knowledge_chunks')
            .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
            .eq('organization_id', organizationId)

        for (const group of groupSet) {
            const filters = keywordGroupContentFilter(group)
            if (filters) {
                focusedQuery = focusedQuery.or(filters)
            }
        }

        if (options?.collectionId) {
            focusedQuery = focusedQuery.eq('knowledge_documents.collection_id', options.collectionId)
        }
        if (options?.type) {
            focusedQuery = focusedQuery.eq('knowledge_documents.type', options.type)
        }
        if (options?.language) {
            focusedQuery = focusedQuery.eq('knowledge_documents.language', options.language)
        }

        const { data, error } = await focusedQuery.limit(focusedLimit)
        if (error || !data) {
            console.error('Focused keyword fallback search failed:', error)
            continue
        }

        for (const row of data as KeywordSearchRow[]) {
            if (row.knowledge_documents?.status !== 'ready') continue
            if (seenChunks.has(row.id)) continue

            seenChunks.add(row.id)
            const content = row.content as string
            const documentTitle = row.knowledge_documents?.title ?? 'Untitled'
            const coverage = lexicalMatchScore(query, `${documentTitle}\n${content}`)

            results.push({
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: documentTitle,
                document_type: row.knowledge_documents?.type ?? 'article',
                content,
                similarity: Math.max(0.25, 0.56 + coverage * 0.3)
            })
        }

        if (results.length >= limit * 3) break
    }

    return results
}

async function searchKnowledgeBaseByTitle(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const supabase = options?.supabase || await createClient()
    const keywords = Array.from(new Set(extractKeywordTokens(query).flatMap(expandKeywordToken)))
    if (keywords.length === 0) return []

    const filters = keywords
        .map((keyword) => `title.ilike.%${sanitizeKeyword(keyword)}%`)
        .join(',')

    let documentQuery = supabase
        .from('knowledge_documents')
        .select('id, title, type, status')
        .eq('organization_id', organizationId)
        .eq('status', 'ready')

    if (options?.collectionId) {
        documentQuery = documentQuery.eq('collection_id', options.collectionId)
    }
    if (options?.type) {
        documentQuery = documentQuery.eq('type', options.type)
    }
    if (options?.language) {
        documentQuery = documentQuery.eq('language', options.language)
    }

    const broadDocumentTitleQuery = hasDocumentNumberQuestionSignal(query)
        || hasDirectiveWord(query)
        || hasRegulationWord(query)
    const documentCandidateLimit = broadDocumentTitleQuery
        ? Math.max(limit * 16, 500)
        : Math.max(limit * 8, 120)
    const { data: documents, error: documentError } = await documentQuery
        .or(filters)
        .limit(documentCandidateLimit)
    if (documentError || !documents) {
        console.error('Title fallback document search failed:', documentError)
        return []
    }

    const rankedDocuments = (documents as TitleSearchDocumentRow[])
        .filter((row) => row.status === 'ready')
        .map((row) => ({
            ...row,
            score: lexicalMatchScore(query, row.title ?? '')
                + documentTitleCoverageScore(query, row.title)
                + abbreviationInitialismScore(query, row.title)
        }))
        .filter((row) => row.score >= 0.35)
        .sort((left, right) => right.score - left.score)
        .slice(0, Math.max(4, Math.min(12, limit)))

    const documentIds = rankedDocuments.map((row) => row.id)
    if (documentIds.length === 0) return []

    const documentById = new Map(rankedDocuments.map((row) => [row.id, row]))
    const { data: chunks, error: chunkError } = await supabase
        .from('knowledge_chunks')
        .select('id, document_id, chunk_index, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .in('document_id', documentIds)
        .order('chunk_index')
        .limit(broadDocumentTitleQuery ? Math.max(limit * 5, 40) : Math.max(limit * 3, 24))

    if (chunkError || !chunks) {
        console.error('Title fallback chunk search failed:', chunkError)
        return []
    }

    return (chunks as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentScore = documentById.get(row.document_id)?.score ?? 0
            const chunkScore = lexicalMatchScore(query, `${row.knowledge_documents?.title ?? ''}\n${row.content}`)
            const earlyChunkBoost = Math.max(0, 0.08 - Number(row.chunk_index ?? 0) * 0.015)

            return {
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: row.knowledge_documents?.title ?? 'Untitled',
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content as string,
                similarity: Math.max(
                    0.2,
                    0.5 + documentScore * 0.18 + chunkScore * 0.2 + earlyChunkBoost
                )
            }
        })
}

async function searchKnowledgeBaseBySourcePath(
    query: string,
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    const supabase = options?.supabase || await createClient()
    const candidates = sourceSlugCandidates(query)
    if (candidates.length === 0) return []

    const filters = candidates
        .map((candidate) => `content.ilike.%${sanitizeKeyword(candidate)}%`)
        .join(',')

    let sourceQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents!inner(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .or(filters)
        .limit(Math.max(limit * 4, 24))

    if (options?.collectionId) {
        sourceQuery = sourceQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        sourceQuery = sourceQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        sourceQuery = sourceQuery.eq('knowledge_documents.language', options.language)
    }

    const { data, error } = await sourceQuery
    if (error || !data) {
        console.error('Source URL fallback search failed:', error)
        return []
    }

    return (data as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .map((row) => {
            const documentTitle = row.knowledge_documents?.title ?? 'Untitled'
            const sourceUrl = extractSourceUrlFromContent(row.content)
            const sourceScore = sourceSlugMatchScore(query, sourceUrl)
            const chunkScore = lexicalMatchScore(query, `${documentTitle}\n${row.content}\n${sourceUrl}`)

            return {
                chunk_id: row.id as string,
                document_id: row.document_id as string,
                document_title: documentTitle,
                document_type: row.knowledge_documents?.type ?? 'article',
                content: row.content as string,
                similarity: Math.max(
                    0.2,
                    0.52 + sourceScore * 0.24 + chunkScore * 0.16
                )
            }
        })
}

function chunkContentHasMetadata(content: string) {
    return /^Page Title:\s+/im.test(content) || /^Document Title:\s+/im.test(content)
}

function chunkContentHasSectionMetadata(content: string) {
    return /^Section:\s+/im.test(content)
}

function normalizeSectionHeading(value: string) {
    return value
        .replace(/^#{1,6}\s+/, '')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140)
        .trim()
}

function hasTurkishOrLatinLetter(value: string) {
    return /[A-Za-zÇĞİÖŞÜçğıöşü]/.test(value)
}

function isMostlyUppercaseHeading(value: string) {
    const letters = value.match(/[A-Za-zÇĞİÖŞÜçğıöşü]/g) ?? []
    if (letters.length < 4) return false

    const uppercaseLetters = letters.filter((letter) => letter === letter.toLocaleUpperCase('tr-TR')).length
    return uppercaseLetters / letters.length >= 0.72
}

function hasStandaloneHeadingContext(previousLine: string | undefined, nextLine: string | undefined) {
    const hasBoundaryBefore = !previousLine || previousLine.trim().length === 0
    const hasBodyAfter = Boolean(nextLine?.trim())

    return hasBoundaryBefore && hasBodyAfter
}

function isShortHeadingLikeLine(value: string) {
    if (value.length < 4 || value.length > 110) return false
    if (!hasTurkishOrLatinLetter(value)) return false
    if (/[.!?;,]$/.test(value)) return false
    if (estimateTokenCount(value) > 12) return false

    return true
}

function extractStructuredHeading(line: string, previousLine?: string, nextLine?: string) {
    const trimmedLine = line.trim()
    const markdownHeading = trimmedLine.match(/^#{1,6}\s+(.+)$/)
    if (markdownHeading?.[1]) return normalizeSectionHeading(markdownHeading[1])

    const normalized = normalizeSectionHeading(trimmedLine)
    if (!normalized) return null

    const legalArticleHeading = normalized.match(/^(?:MADDE|Madde|madde)\s+\d+[A-Za-zÇĞİÖŞÜçğıöşü0-9/]*(?:\s*[-–—:.]\s*[^.;!?]{1,100})?/)
    if (legalArticleHeading?.[0]) return normalizeSectionHeading(legalArticleHeading[0])

    const numberedHeading = normalized.match(/^(?:\d+(?:\.\d+){0,4}|[IVXLCDM]+)\.?\s+.+$/i)
    if (
        numberedHeading
        && !/^\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/.test(normalized)
        && hasStandaloneHeadingContext(previousLine, nextLine)
        && isShortHeadingLikeLine(normalized)
    ) {
        return normalized
    }

    if (
        hasStandaloneHeadingContext(previousLine, nextLine)
        && isShortHeadingLikeLine(normalized)
        && isMostlyUppercaseHeading(normalized)
    ) {
        return normalized
    }

    return null
}

function splitStructuredDocumentSections(content: string) {
    const normalizedContent = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
    if (!normalizedContent) return []

    const lines = normalizedContent.split('\n')
    const headings: Array<{ index: number; title: string }> = []

    for (let index = 0; index < lines.length; index += 1) {
        const title = extractStructuredHeading(lines[index] ?? '', lines[index - 1], lines[index + 1])
        if (title) headings.push({ index, title })
    }

    if (headings.length < 2) return []

    const sections: Array<{ sectionTitle?: string; content: string }> = []
    if (headings[0]?.index && headings[0].index > 0) {
        const preamble = lines.slice(0, headings[0].index).join('\n').trim()
        if (preamble) sections.push({ content: preamble })
    }

    for (const [index, heading] of headings.entries()) {
        const nextHeading = headings[index + 1]
        const sectionContent = lines
            .slice(heading.index, nextHeading?.index ?? lines.length)
            .join('\n')
            .trim()

        if (sectionContent) {
            sections.push({
                sectionTitle: heading.title,
                content: sectionContent
            })
        }
    }

    return sections
}

function chunkKnowledgeDocumentContent(content: string): IndexedSourceChunk[] {
    const sections = splitStructuredDocumentSections(content)
    if (sections.length === 0) return chunkText(content)

    const chunks = sections.flatMap((section) => (
        chunkText(section.content).map((chunk) => ({
            ...chunk,
            sectionTitle: section.sectionTitle
        }))
    ))

    if (chunks.length > 200) {
        throw new Error(`Content too large for indexing (chunks=${chunks.length}, max=200).`)
    }

    return chunks
}

function buildIndexedChunkContent(title: string, content: string, sectionTitle?: string) {
    const normalizedTitle = title.trim()
    const normalizedContent = content.trim()
    const normalizedSectionTitle = normalizeSectionHeading(sectionTitle ?? '')
    const metadataLines: string[] = []

    if (normalizedTitle && !chunkContentHasMetadata(normalizedContent)) {
        metadataLines.push(`Document Title: ${normalizedTitle}`)
    }

    if (normalizedSectionTitle && !chunkContentHasSectionMetadata(normalizedContent)) {
        metadataLines.push(`Section: ${normalizedSectionTitle}`)
    }

    if (metadataLines.length === 0) return normalizedContent

    return `${metadataLines.join('\n')}\n\n${normalizedContent}`
}

async function buildAndStoreChunks(
    supabase: SupabaseClientLike,
    organizationId: string,
    documentId: string,
    title: string,
    content: string
) {
    const chunks = chunkKnowledgeDocumentContent(content)
    if (chunks.length === 0) return
    const indexedChunks = chunks.map((chunk) => {
        const indexedContent = buildIndexedChunkContent(title, chunk.content, chunk.sectionTitle)
        return {
            ...chunk,
            content: indexedContent,
            tokenCount: estimateTokenCount(indexedContent)
        }
    })

    const embeddings = await generateEmbeddings(
        indexedChunks.map((chunk) => chunk.content),
        {
            organizationId,
            supabase,
            usageMetadata: {
                source: 'knowledge_chunk_index_embedding',
                document_id: documentId
            }
        }
    )

    const rows = indexedChunks.map((chunk, index) => ({
        document_id: documentId,
        organization_id: organizationId,
        chunk_index: index,
        content: chunk.content,
        token_count: chunk.tokenCount,
        embedding: formatEmbeddingForPgvector(embeddings[index] ?? [])
    }))

    const { error } = await supabase.from('knowledge_chunks').insert(rows)
    if (error) {
        console.error('Failed to insert knowledge chunks:', error)
        throw new Error(error.message)
    }
}

export async function deleteCollection(id: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    // Explicitly delete all knowledge entries in this collection first
    const { error: filesError } = await supabase
        .from('knowledge_documents')
        .delete()
        .eq('collection_id', id)

    if (filesError) throw new Error(filesError.message)

    // Then delete the collection itself
    const { error } = await supabase.from('knowledge_collections').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/knowledge', 'layout') // Ensure layout revalidates
}

export async function updateCollection(id: string, name: string) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const { data, error } = await supabase
        .from('knowledge_collections')
        .update({ name })
        .eq('id', id)
        .select()
        .single()

    if (error) throw new Error(error.message)
    revalidatePath('/knowledge', 'layout')
    return data as KnowledgeCollection
}
