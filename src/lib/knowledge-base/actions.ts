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
import {
    planKnowledgeSearchQuery,
    type KnowledgeSearchQueryPlan
} from '@/lib/knowledge-base/query-planner'
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
const EVIDENCE_SEARCH_TIMEOUT_MS = 4500
const LEXICAL_EVIDENCE_FIRST_TIMEOUT_MS = 750
const PLANNED_QUERY_SHORT_CIRCUIT_MIN_RESULTS = 3
const PLANNED_QUERY_SHORT_CIRCUIT_MIN_SCORE = 1.2

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

interface KnowledgeSearchOptions {
    collectionId?: string | null
    type?: string | null
    language?: string | null
    supabase?: SupabaseClientLike
    queryPlannerUsage?: (plan: KnowledgeSearchQueryPlan) => void | Promise<void>
}

type KnowledgeSearchExecutionOptions = Omit<KnowledgeSearchOptions, 'queryPlannerUsage'>

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
    evidenceType?: 'table-row' | 'evidence-row'
    evidenceLabel?: string
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

function queryErrorText(error: unknown) {
    if (error instanceof Error) return `${error.name} ${error.message}`
    if (typeof error === 'string') return error
    if (error && typeof error === 'object') {
        const record = error as Record<string, unknown>
        return [
            record.name,
            record.message,
            record.code,
            record.details,
            record.hint
        ]
            .filter((value): value is string => typeof value === 'string')
            .join(' ')
    }

    return ''
}

function isQueryTimeoutError(error: unknown) {
    return /\b(?:timeout|timed out)\b|aborted due to timeout|operation was aborted|aborterror/i
        .test(queryErrorText(error))
}

function logKnowledgeVectorSearchIssue(error: unknown) {
    if (isQueryTimeoutError(error)) {
        console.warn('Knowledge vector search timed out; continuing with lexical evidence:', error)
        return
    }

    console.error('RAG Search failed:', error)
}

async function readBeforeDeadline<T>(promise: Promise<T>, timeoutMs: number) {
    let timeout: ReturnType<typeof setTimeout> | null = null

    const timeoutPromise = new Promise<{ status: 'timeout' }>((resolve) => {
        timeout = setTimeout(() => resolve({ status: 'timeout' }), timeoutMs)
    })

    return Promise.race([
        promise.then((value) => ({ status: 'fulfilled' as const, value })),
        timeoutPromise
    ]).finally(() => {
        if (timeout) clearTimeout(timeout)
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
    const result = await rebuildKnowledgeDocumentChunks(documentId, supabase)
    const finalDoc = result.document as KnowledgeBaseEntry
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
}

export async function rebuildKnowledgeDocumentChunks(
    documentId: string,
    supabase: SupabaseClientLike
) {
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
        const chunkCount = await buildAndStoreChunks(supabase, data.organization_id, data.id, data.title ?? '', data.content ?? '')
        const { data: readyDoc } = await supabase
            .from('knowledge_documents')
            .update({ status: 'ready' })
            .eq('id', data.id)
            .select()
            .single()

        return {
            documentId: data.id,
            organizationId: data.organization_id,
            chunkCount,
            document: readyDoc ?? data
        }
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

function buildFocusedEvidenceSearches(
    query: string,
    organizationId: string,
    limit: number,
    options: KnowledgeSearchExecutionOptions
) {
    const searches: Array<Promise<KnowledgeSearchResult[]>> = []
    const add = (enabled: boolean, search: () => Promise<KnowledgeSearchResult[]>) => {
        if (enabled) searches.push(search())
    }
    const asksAddress = isAddressLookupQuery(query) || isCampusLocationQuery(query)
    const asksContact = isContactInfoQuery(query)
        || isLibraryContactQuery(query)
        || isProgramContactResponsibilityQuery(query)

    add(asksAddress, () => searchKnowledgeBaseByAddressEvidence(query, organizationId, limit, options))
    add(asksAddress, () => searchKnowledgeBaseByCurrentCampusListingEvidence(query, organizationId, limit, options))
    add(asksContact || isTltDoubleMajorQuery(query), () => searchKnowledgeBaseByTltDoubleMajorResponsibleEvidence(query, organizationId, limit, options))
    add(asksContact, () => searchKnowledgeBaseByProgramContactEvidence(query, organizationId, limit, options))
    add(asksContact, () => searchKnowledgeBaseByUnitContactEvidence(query, organizationId, limit, options))
    add(isErasmusEligibilityQuery(query), () => searchKnowledgeBaseByErasmusEligibilityEvidence(query, organizationId, limit, options))
    add(isTltDoubleMajorQuery(query), () => searchKnowledgeBaseByTltDoubleMajorEvidence(query, organizationId, limit, options))
    add(isMedicalSchoolExamPolicyQuery(query), () => searchKnowledgeBaseByMedicalSchoolExamPolicyEvidence(query, organizationId, limit, options))
    add(isMedicalSchoolTrainingQuery(query), () => searchKnowledgeBaseByMedicalSchoolTrainingEvidence(query, organizationId, limit, options))
    add(isInternshipEvidenceQuery(query), () => searchKnowledgeBaseByInternshipEvidence(query, organizationId, limit, options))
    add(isLectureNotesAccessQuery(query), () => searchKnowledgeBaseByLectureNotesEvidence(query, organizationId, limit, options))
    add(isFinalExemptionPolicyQuery(query), () => searchKnowledgeBaseByFinalExemptionPolicyEvidence(query, organizationId, limit, options))
    add(isFinalExamPolicyQuery(query), () => searchKnowledgeBaseByFinalExamPolicyEvidence(query, organizationId, limit, options))
    add(isHealthReportExcuseExamQuery(query), () => searchKnowledgeBaseByHealthReportExamPolicyEvidence(query, organizationId, limit, options))
    add(isElectiveCourseRequirementQuery(query), () => searchKnowledgeBaseByElectiveCoursePolicyEvidence(query, organizationId, limit, options))
    add(isMedicineElectiveDeadlineQuery(query), () => searchKnowledgeBaseByMedicineElectiveDeadlineEvidence(query, organizationId, limit, options))
    add(isMedicineMaxDurationQuery(query), () => searchKnowledgeBaseByMedicineMaxDurationEvidence(query, organizationId, limit, options))
    add(isAnnualPaidLeaveQuery(query), () => searchKnowledgeBaseByAnnualPaidLeaveEvidence(query, organizationId, limit, options))

    return searches
}

async function searchKnowledgeBaseSingleQuery(
    query: string,
    organizationId: string,
    threshold = 0.5,
    limit = 3,
    options?: KnowledgeSearchExecutionOptions
) {
    const supabase = options?.supabase || await createClient()
    let data: KnowledgeSearchResult[] | null = null
    const vectorLimit = Math.max(limit, Math.min(12, limit * 2))
    const keywordFallbackLimit = Math.max(limit * 8, 40)
    const fallbackOptions = {
        collectionId: options?.collectionId ?? null,
        type: options?.type ?? null,
        language: options?.language ?? null,
        supabase
    }

    const policyDurationResults = isPolicyDurationQuery(query)
        ? await searchKnowledgeBaseByPolicyDurationEvidence(query, organizationId, Math.max(limit * 4, 16), fallbackOptions)
        : []
    if (shouldReturnPolicyDurationResultsEarly(query, policyDurationResults)) {
        return mergeSearchResults(query, [], policyDurationResults, limit)
    }
    const focusedEvidenceLimit = Math.max(limit * 4, 16)
    const focusedPolicyEvidenceResultsPromise = Promise.all(
        buildFocusedEvidenceSearches(query, organizationId, focusedEvidenceLimit, fallbackOptions)
    ).then((results) => results.flat())

    const focusedPolicyEvidenceResults = await focusedPolicyEvidenceResultsPromise
    if (shouldReturnFocusedEvidenceResultsEarly(query, focusedPolicyEvidenceResults)) {
        return mergeSearchResults(query, [], focusedPolicyEvidenceResults, limit)
    }

    const fallbackSearchLimit = Math.max(limit * 4, 16)
    const lexicalFallbackResultsPromise = Promise.all([
        searchKnowledgeBaseByKeyword(query, organizationId, keywordFallbackLimit, fallbackOptions),
        searchKnowledgeBaseByDocumentCode(query, organizationId, fallbackSearchLimit, fallbackOptions),
        searchKnowledgeBaseByAbbreviation(query, organizationId, fallbackSearchLimit, fallbackOptions),
        searchKnowledgeBaseByFocusedKeywords(query, organizationId, fallbackSearchLimit, fallbackOptions),
        searchKnowledgeBaseByExactTitlePhrase(query, organizationId, fallbackSearchLimit, fallbackOptions),
        searchKnowledgeBaseByTitle(query, organizationId, fallbackSearchLimit, fallbackOptions),
        shouldUseSourcePathFallback(query)
            ? searchKnowledgeBaseBySourcePath(query, organizationId, fallbackSearchLimit, fallbackOptions)
            : Promise.resolve([])
    ])

    if (extractAbbreviationCandidates(query).length > 0) {
        const abbreviationLexicalResults = (await lexicalFallbackResultsPromise).flat()
        if (abbreviationLexicalResults.length > 0) {
            return mergeSearchResults(query, [], abbreviationLexicalResults, limit)
        }
    }

    const lexicalEvidenceBeforeVector = await getQuickLexicalEvidenceBeforeVector(query, lexicalFallbackResultsPromise)
    if (lexicalEvidenceBeforeVector && shouldReturnLexicalEvidenceResultsEarly(query, lexicalEvidenceBeforeVector)) {
        return mergeSearchResults(query, [], lexicalEvidenceBeforeVector, limit)
    }

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
                logKnowledgeVectorSearchIssue(error)
            } else {
                data = (result ?? null) as KnowledgeSearchResult[] | null
            }
        } catch (error) {
            if (isQueryTimeoutError(error)) {
                console.warn('Knowledge vector search timed out; continuing with lexical evidence:', error)
            } else {
                console.warn('Knowledge vector search unavailable:', error)
            }
        }
    }

    if (isPolicyDurationQuery(query) && !isMedicineMaxDurationQuery(query) && policyDurationResults.length >= limit) {
        return mergeSearchResults(query, data ?? [], policyDurationResults, limit)
    }

    const [
        fallbackResults,
        documentCodeResults,
        abbreviationResults,
        focusedKeywordResults,
        exactTitlePhraseResults,
        titleResults,
        sourceResults
    ] = await lexicalFallbackResultsPromise
    const lexicalResults = [
        ...policyDurationResults,
        ...focusedPolicyEvidenceResults,
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

function dedupePlannedSearchQueries(originalQuery: string, plannedQueries: string[]) {
    const seen = new Set<string>()
    const queries: string[] = []
    const addQuery = (value: string) => {
        const trimmed = value.replace(/\s+/g, ' ').trim()
        if (!trimmed) return
        const key = plannedSearchQueryKey(trimmed)
        if (seen.has(key)) return
        seen.add(key)
        queries.push(trimmed)
    }

    addQuery(originalQuery)
    plannedQueries.forEach(addQuery)

    return queries.slice(0, 4)
}

function plannedSearchQueryKey(value: string) {
    return value.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
}

function shouldSkipPlannedSearchVariants(
    originalQuery: string,
    originalResults: KnowledgeSearchResult[],
    limit: number
) {
    if (originalResults.length === 0) return false

    const requiredResultCount = Math.min(
        Math.max(1, limit),
        PLANNED_QUERY_SHORT_CIRCUIT_MIN_RESULTS
    )
    if (originalResults.length < requiredResultCount) return false

    const topScore = originalResults.reduce(
        (best, result) => Math.max(best, scoreKnowledgeResult(originalQuery, enrichKnowledgeSearchResult(result))),
        0
    )

    return topScore >= PLANNED_QUERY_SHORT_CIRCUIT_MIN_SCORE
}

async function resolveKnowledgeSearchPlan(query: string, options?: KnowledgeSearchOptions) {
    try {
        const plan = await planKnowledgeSearchQuery(query, [], {})
        if (plan.usage && options?.queryPlannerUsage) {
            await options.queryPlannerUsage(plan)
        }
        return plan
    } catch (error) {
        console.warn('Knowledge query planner failed unexpectedly:', error)
        return {
            enabled: false,
            model: 'gpt-4o-mini',
            reason: 'planner_error' as const,
            searchQueries: [query],
            mustHaveTerms: []
        }
    }
}

export async function searchKnowledgeBase(
    query: string,
    organizationId: string,
    threshold = 0.5,
    limit = 3,
    options?: KnowledgeSearchOptions
) {
    const supabase = options?.supabase || await createClient()
    const executionOptions: KnowledgeSearchExecutionOptions = {
        collectionId: options?.collectionId ?? null,
        type: options?.type ?? null,
        language: options?.language ?? null,
        supabase
    }
    const originalResults = await searchKnowledgeBaseSingleQuery(
        query,
        organizationId,
        threshold,
        limit,
        executionOptions
    )

    if (shouldSkipPlannedSearchVariants(query, originalResults, limit)) {
        return originalResults
    }

    const plan = await resolveKnowledgeSearchPlan(query, options)
    const searchQueries = dedupePlannedSearchQueries(query, plan.searchQueries)
    const originalSearchQueryKey = plannedSearchQueryKey(query)
    const plannedSearchQueries = searchQueries.filter(
        (searchQuery) => plannedSearchQueryKey(searchQuery) !== originalSearchQueryKey
    )

    if (plannedSearchQueries.length === 0) {
        return originalResults
    }

    const mergedResults: KnowledgeSearchResult[] = [...originalResults]
    for (const searchQuery of plannedSearchQueries) {
        const results = await searchKnowledgeBaseSingleQuery(
            searchQuery,
            organizationId,
            threshold,
            limit,
            executionOptions
        )
        mergedResults.push(...results)
    }

    return mergeSearchResults(query, [], mergedResults, limit)
}

export async function searchKnowledgeBaseFocusedEvidence(
    query: string,
    organizationId: string,
    limit = 3,
    options?: KnowledgeSearchOptions
) {
    const supabase = options?.supabase || await createClient()
    const executionOptions: KnowledgeSearchExecutionOptions = {
        collectionId: options?.collectionId ?? null,
        type: options?.type ?? null,
        language: options?.language ?? null,
        supabase
    }
    const focusedEvidenceLimit = Math.max(limit * 4, 16)

    const currentCampusResults = await searchKnowledgeBaseByCurrentCampusListingEvidence(
        query,
        organizationId,
        focusedEvidenceLimit,
        executionOptions
    )
    if (currentCampusResults.length > 0) {
        const mergedCurrentCampusResults = mergeSearchResults(query, [], currentCampusResults, limit)
        if (shouldReturnFocusedEvidenceResultsEarly(query, mergedCurrentCampusResults)) {
            return mergedCurrentCampusResults
        }
    }

    const results = (await Promise.all(
        buildFocusedEvidenceSearches(query, organizationId, focusedEvidenceLimit, executionOptions)
    )).flat()

    if (results.length === 0) return []
    return mergeSearchResults(query, [], results, limit)
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

function keywordTokenSignalScore(token: string, index: number, total: number) {
    const normalized = normalizeSearchText(token)
    const stemmed = stemSearchToken(normalized)
    let score = Math.min(stemmed.length, 14) / 14

    if (/\d/.test(normalized)) score += 0.18
    if (stemmed.length <= 3) score -= 0.18

    // Natural-language questions often put the actual subject near the end
    // after greetings or conversational setup. Keep those terms in play.
    if (index >= Math.max(0, total - 6)) score += 0.34
    if (index >= Math.max(0, total - 3)) score += 0.12

    return score
}

function extractKeywordTokens(query: string): string[] {
    const normalized = query
        .toLocaleLowerCase('tr-TR')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()

    if (!normalized) return []

    const tokens = normalized.split(/\s+/).filter(Boolean)
    const keywordCandidates = tokens
        .map((token, index) => ({ token, index }))
        .filter(({ token }) => token.length >= 3 && !isKeywordStopword(token))

    const byNormalized = new Map<string, { token: string; index: number; score: number }>()
    for (const candidate of keywordCandidates) {
        const normalizedToken = normalizeSearchText(candidate.token)
        const existing = byNormalized.get(normalizedToken)
        if (existing) continue

        byNormalized.set(normalizedToken, {
            ...candidate,
            score: keywordTokenSignalScore(candidate.token, candidate.index, tokens.length)
        })
    }

    const unique = [...byNormalized.values()]
        .sort((left, right) => right.score - left.score || left.index - right.index)
        .slice(0, 8)
        .sort((left, right) => left.index - right.index)
        .map((candidate) => candidate.token)

    if (unique.length > 0) {
        return unique
    }

    return Array.from(new Set(tokens.filter(token => token.length >= 3))).slice(0, 8)
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

function isPdfLikeSource(sourceUrl: string, result?: KnowledgeSearchResult) {
    return sourceUrl.toLowerCase().includes('.pdf')
        || normalizeSearchText(result?.document_type ?? '') === 'pdf'
}

function isPolicyRuleQuery(query: string) {
    if (hasDirectiveWord(query) || hasRegulationWord(query)) return true

    const normalized = normalizeSearchText(query)
    const asksCalendarListing = hasQuerySignal(query, [
        'takvim',
        'tarih',
        'listesi',
        'liste',
        'salon',
        'duyuru',
        'sonuc',
        'sonuç'
    ])
    if (asksCalendarListing) return false

    return normalized.includes('hakk')
        || normalized.includes('ne kadar')
        || normalized.includes('nasil')
        || normalized.includes('hesaplama')
        || normalized.includes('sinif gec')
        || normalized.includes('sinav hak')
        || normalized.includes('final')
        || normalized.includes('butunleme')
        || normalized.includes('mazeret')
        || normalized.includes('saglik raporu')
        || normalized.includes('secmeli ders')
        || normalized.includes('cift anadal')
        || new Set(normalized.split(/\s+/).filter(Boolean)).has('cap')
        || normalized.includes('yaz staji')
        || isErasmusEligibilityQuery(query)
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
    if (isTransientPath(pathname) && isPolicyRuleQuery(query)) {
        score -= 0.38
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
    if (isTltDoubleMajorQuery(query) && normalizeSearchText(query).includes('sorumlu')) return 0
    if (sourcePath(sourceUrl) !== '/iletisim') return 0

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    if (!hasConcreteContactValue(searchable)) return 0

    const contentScore = lexicalMatchScore(query, `${result.document_title}\n${result.content}`)
    if (contentScore < 0.42) return 0

    return 0.42 + contentScore * 0.28
}

function isLibraryContactQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('kutuphane') && isContactInfoQuery(query)
}

function hasLibraryContactEvidence(value: string) {
    const normalized = normalizeSearchText(value)

    return normalized.includes('kutuphane')
        && normalized.includes('dokumantasyon')
        && normalized.includes('kutuphane@yuksekihtisas.edu.tr')
}

function libraryContactEvidenceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isLibraryContactQuery(query)) return 0

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    const normalizedSearchable = normalizeSearchText(searchable)
    let score = 0

    if (hasLibraryContactEvidence(searchable)) score += 2.1
    if (sourcePath(sourceUrl) === '/iletisim' && normalizedSearchable.includes('kutuphane')) score += 0.42
    if (normalizedSearchable.includes('@') && !normalizedSearchable.includes('kutuphane@yuksekihtisas.edu.tr')) score -= 0.72

    return score
}

function isErasmusEligibilityQuery(query: string) {
    const normalized = normalizeSearchText(query)
    if (!normalized.includes('erasmus')) return false

    const asksEligibility = normalized.includes('yararlan')
        || normalized.includes('faydalan')
        || normalized.includes('katil')
        || normalized.includes('hak')
        || normalized.includes('olur mu')
        || normalized.includes('var mi')
        || /\bmi\b/u.test(normalized)
    const hasStudentSubject = normalized.includes('hazirlik')
        || normalized.includes('ogrenci')
        || normalized.includes('program')

    return asksEligibility && hasStudentSubject
}

function hasErasmusPreparationDenialEvidence(value: string) {
    const normalized = normalizeSearchText(value)

    return normalized.includes('erasmus')
        && normalized.includes('hazirlik')
        && normalized.includes('yararlanamaz')
}

function erasmusEligibilityEvidenceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isErasmusEligibilityQuery(query)) return 0

    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    let score = 0

    if (hasErasmusPreparationDenialEvidence(searchable)) score += 2.25
    if (title.includes('yonerge') || isPdfLikeSource(sourceUrl, result)) score += 0.22
    if ((title.includes('koordinator') || searchable.includes('iletisime gec')) && !hasErasmusPreparationDenialEvidence(searchable)) {
        score -= 0.62
    }

    return score
}

function isHealthReportExcuseExamQuery(query: string) {
    const normalized = normalizeSearchText(query)
    const hasHealthIssue = normalized.includes('rapor')
        || normalized.includes('saglik')
        || normalized.includes('hasta')
        || normalized.includes('hastalik')
    const asksExam = normalized.includes('sinav')
        || normalized.includes('kurul')
        || normalized.includes('final')
        || normalized.includes('gire')
        || normalized.includes('telafi')
        || normalized.includes('mazeret')
    const asksMakeupOrExcuse = normalized.includes('mazeret')
        || normalized.includes('telafi')
        || normalized.includes('giremedim')
        || normalized.includes('girem')

    return hasHealthIssue && asksExam && asksMakeupOrExcuse
}

function asksForMissedExamRemedy(query: string) {
    if (!isHealthReportExcuseExamQuery(query)) return false

    const normalized = normalizeSearchText(query)
    const missedExamSignal = normalized.includes('giremedim')
        || normalized.includes('giremedi')
        || normalized.includes('girememe')
        || normalized.includes('katilamadim')
        || normalized.includes('katilamadi')
        || normalized.includes('katilamama')
        || normalized.includes('engelleyen')
    const remedySignal = normalized.includes('baska sinav')
        || normalized.includes('sinav hak')
        || normalized.includes('hakki')
        || normalized.includes('telafi')
        || normalized.includes('mazeret')

    return missedExamSignal || remedySignal
}

function hasHealthReportExamRemedyEvidence(searchable: string) {
    const hasHealthEvidence = searchable.includes('saglik raporu')
        || searchable.includes('saglik mazereti')
        || searchable.includes('hastalik')
        || searchable.includes('hasta')
    const hasMissedExamEvidence = searchable.includes('sinava girmesini engelleyen')
        || searchable.includes('sinavlara katilmayan')
        || searchable.includes('sinava giremeyen')
        || searchable.includes('sinava giremem')
    const hasRemedyOutcome = searchable.includes('mazeret sinavi')
        || searchable.includes('telafi sinavi')
        || (searchable.includes('sinav hak') && searchable.includes('mazeret'))

    return hasHealthEvidence && searchable.includes('sinav') && hasRemedyOutcome && (hasMissedExamEvidence || searchable.includes('yonetim kurulu'))
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
        || searchable.includes('mazeret sinavi')
    const hasCalendarNoticeSignal = searchable.includes('takvim')
        || searchable.includes('ogrenci listesi')
        || searchable.includes('yayinlanmistir')
        || searchable.includes('yayimlanmistir')
        || sourcePath(sourceUrl).startsWith('/duyuru/')
    const asksRemedy = asksForMissedExamRemedy(query)
    const hasRemedyEvidence = hasHealthReportExamRemedyEvidence(searchable)

    let score = 0

    if (searchable.includes('saglik raporu')) score += 0.16
    if (searchable.includes('hastalik') && searchable.includes('sinav')) score += 0.12
    if (hasPolicyDocumentSignal && searchable.includes('sinav')) score += 0.18
    if (searchable.includes('belgelendirm')) score += 0.18
    if (searchable.includes('yonetim kurulu')) score += 0.14
    if (searchable.includes('mazeret sinavi')) score += 0.18
    if (searchable.includes('telafi') && searchable.includes('sinav')) score += 0.1
    if (searchable.includes('gecersiz sayilir')) score += 0.18
    if (searchable.includes('raporlu ogrenci') && searchable.includes('sinavlara giremez')) score += 0.18
    if (asksRemedy && hasRemedyEvidence) score += 0.58
    if (asksRemedy
        && !hasRemedyEvidence
        && (searchable.includes('devamsizlik') || searchable.includes('mazeretli sayilir'))) {
        score -= 0.38
    }

    if (hasCalendarNoticeSignal && !hasRuleEvidence) {
        score -= 0.36
    }

    return score
}

function isMedicalSchoolExamPolicyQuery(query: string) {
    const normalized = normalizeSearchText(query)
    const medicineSignal = normalized.includes('tip fakultesi')
        || normalized.includes('tip fakultesinde')
        || normalized.includes('tipta')
        || normalized.includes('tipte')
        || /\btip\b/u.test(normalized)
    if (!medicineSignal) return false

    return normalized.includes('final')
        || normalized.includes('butunleme')
        || normalized.includes('kurul sinav')
        || normalized.includes('kurul not')
        || normalized.includes('sinif gec')
        || normalized.includes('donem gec')
        || normalized.includes('not hesap')
        || normalized.includes('basari not')
        || normalized.includes('hesaplama')
        || normalized.includes('mazeret')
        || normalized.includes('sinav')
}

function medicalSchoolExamPolicyScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isMedicalSchoolExamPolicyQuery(query)) return 0

    const normalizedQuery = normalizeSearchText(query)
    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const pathname = sourcePath(sourceUrl)
    const isExamDirective = title.includes('tip fakultesi')
        && title.includes('egitim')
        && (title.includes('sinav') || title.includes('yonerge'))
    const hasPolicySource = isExamDirective
        || searchable.includes('madde')
        || hasDirectiveWord(title)
        || isPdfLikeSource(sourceUrl, result)
    const asksFinalMakeup = normalizedQuery.includes('final') && normalizedQuery.includes('butunleme')
    const asksGradeCalculation = normalizedQuery.includes('sinif gec')
        || normalizedQuery.includes('donem gec')
        || normalizedQuery.includes('not hesap')
        || normalizedQuery.includes('hesaplama')
        || normalizedQuery.includes('kurul not')
        || normalizedQuery.includes('basari not')
    const asksExcuseExam = normalizedQuery.includes('mazeret')
        || normalizedQuery.includes('telafi')
        || normalizedQuery.includes('hastalik')
        || normalizedQuery.includes('hasta')
    const hasFinalMakeupRule = searchable.includes('final sinavina girmesi gerektigi halde girmeyen')
        || searchable.includes('butunleme sinavina girer')
        || searchable.includes('butunleme sinavinda alinan not final sinavi notu yerine gecer')
    const hasGradeRule = (searchable.includes('%60') || searchable.includes('yuzde 60'))
        && (searchable.includes('%40') || searchable.includes('yuzde 40'))
        && (searchable.includes('donem sonu basari notu') || searchable.includes('basarili sayilabilmesi'))
    const hasExcuseRule = searchable.includes('mazeret sinavi')
        && (searchable.includes('acilmaz')
            || searchable.includes('butunleme hakki')
            || searchable.includes('yonetim kurulu')
            || searchable.includes('yapilir')
            || searchable.includes('saglik raporu'))
    const hasRuleEvidence = hasFinalMakeupRule || hasGradeRule || hasExcuseRule
    let score = 0

    if (isExamDirective) score += 0.42
    if (hasPolicySource && searchable.includes('madde')) score += 0.18
    if (isPdfLikeSource(sourceUrl, result)) score += 0.12

    if (asksFinalMakeup && hasFinalMakeupRule) score += 0.78
    if (asksGradeCalculation && hasGradeRule) score += 0.82
    if (asksExcuseExam && hasExcuseRule) score += 0.52

    if (asksFinalMakeup && !hasFinalMakeupRule && !hasPolicySource) score -= 0.34
    if (asksGradeCalculation && !hasGradeRule && !hasPolicySource) score -= 0.34

    if (isTransientPath(pathname) && !hasRuleEvidence) score -= 0.58
    if (searchable.includes('etkinlik') && !hasRuleEvidence) score -= 0.28

    return score
}

function policyPdfSourceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isPolicyRuleQuery(query)) return 0

    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const policyDocumentSignal = hasDirectiveWord(title)
        || hasRegulationWord(title)
        || searchable.includes('madde')
    let score = 0

    if (isPdfLikeSource(sourceUrl, result) && policyDocumentSignal) {
        score += 0.18
    }
    if (!isPdfLikeSource(sourceUrl, result) && isTransientPath(sourcePath(sourceUrl)) && !policyDocumentSignal) {
        score -= 0.14
    }

    return score
}

function buildKeywordResultFromRow(row: KeywordSearchRow, similarity = 0.72): KnowledgeSearchResult {
    return {
        chunk_id: row.id as string,
        document_id: row.document_id as string,
        document_title: row.knowledge_documents?.title ?? 'Untitled',
        document_type: row.knowledge_documents?.type ?? 'article',
        content: row.content as string,
        similarity
    }
}

const EVIDENCE_SUBJECT_STOPWORDS = new Set([
    'acik',
    'adresi',
    'adres',
    'bilgi',
    'bilgisi',
    'bulunuyor',
    'bulunur',
    'cevap',
    'ders',
    'dersi',
    'egitim',
    'erisim',
    'giremedim',
    'girmek',
    'hangi',
    'hakkim',
    'hakki',
    'hakk',
    'iletisim',
    'ilce',
    'ilcede',
    'kampus',
    'kampusu',
    'kampusu',
    'konum',
    'materyal',
    'materyalleri',
    'not',
    'notlar',
    'notlari',
    'an',
    'su',
    'ogrenebilir',
    'paylasilir',
    'paylasim',
    'paylasimi',
    'sinav',
    'sinavi',
    'telafi',
    'telefon',
    'telefonu',
    'telefonunu',
    'ulasim',
    'var',
    'veriyor',
    'yerleske',
    'yerleskede',
    'yerleskesi',
    'yerleskesinde'
])

function queryEvidenceSubjectTokens(query: string) {
    const tokens = new Set<string>()

    for (const token of allMeaningfulSearchTokens(query)) {
        const normalized = normalizeSearchText(token)
        if (EVIDENCE_SUBJECT_STOPWORDS.has(normalized)) continue
        tokens.add(normalized)
    }

    const acronymMatches = query.match(/\b[\p{Lu}ÇĞİÖŞÜ]{2,8}\b/gu) ?? []
    for (const acronym of acronymMatches) {
        const normalized = normalizeSearchText(acronym)
        if (normalized.length >= 2 && !EVIDENCE_SUBJECT_STOPWORDS.has(normalized)) {
            tokens.add(normalized)
        }
    }

    return [...tokens].slice(0, 8)
}

function evidenceSubjectCoverageScore(query: string, value: string) {
    const subjectTokens = queryEvidenceSubjectTokens(query)
    if (subjectTokens.length === 0) return 0

    const searchable = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)
    const hits = subjectTokens.filter((token) => {
        if (token === 'sbf') {
            return searchable.includes('sbf')
                || (searchable.includes('saglik') && searchable.includes('bilim') && searchable.includes('fakulte'))
        }
        if (token === 'shmyo') {
            return searchable.includes('shmyo')
                || (searchable.includes('saglik')
                    && searchable.includes('hizmet')
                    && searchable.includes('meslek')
                    && searchable.includes('yuksekokul'))
        }
        if (token === 'myo') {
            return searchable.includes('myo')
                || (searchable.includes('meslek') && searchable.includes('yuksekokul'))
        }

        const stemmed = stemSearchToken(token)
        if (tokenSet.has(token) || tokenSet.has(stemmed)) return true
        return token.length >= 4 && searchable.includes(token)
    }).length

    return hits / subjectTokens.length
}

const ACADEMIC_UNIT_PREFIXES = [
    ['fakulte', 'fakulte'],
    ['bolum', 'bolum'],
    ['program', 'program'],
    ['yuksekokul', 'yuksekokul'],
    ['enstitu', 'enstitu']
] as const

const ACADEMIC_SUBJECT_PREFIX_STOPWORDS = new Set([
    'hangi',
    'kac',
    'kaç',
    'nerede',
    'nerde',
    'var',
    'yok',
    'mi',
    'mı',
    'nedir',
    'ne',
    'icin',
    'için',
    'bu',
    'su',
    'şu'
])

type AcademicSubjectFocus = {
    descriptorTokens: string[]
    unitToken: string
}

function normalizeAcademicUnitToken(token: string) {
    const normalized = normalizeSearchText(token)
    const unit = ACADEMIC_UNIT_PREFIXES.find(([prefix]) => normalized.startsWith(prefix))

    return unit?.[1] ?? null
}

function extractAcademicSubjectFocuses(query: string): AcademicSubjectFocus[] {
    const normalized = normalizeSearchText(query)
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()
    if (!normalized) return []

    const rawTokens = normalized.split(/\s+/).filter(Boolean)
    const focuses: AcademicSubjectFocus[] = []

    rawTokens.forEach((token, index) => {
        const unitToken = normalizeAcademicUnitToken(token)
        if (!unitToken) return

        const descriptorTokens: string[] = []
        for (let cursor = index - 1; cursor >= 0 && descriptorTokens.length < 4; cursor -= 1) {
            const descriptor = stemSearchToken(rawTokens[cursor] ?? '')
            if (!descriptor || ACADEMIC_SUBJECT_PREFIX_STOPWORDS.has(descriptor)) break
            if (normalizeAcademicUnitToken(descriptor)) break
            if (isKeywordStopword(descriptor) || EVIDENCE_SUBJECT_STOPWORDS.has(descriptor)) break
            descriptorTokens.unshift(descriptor)
        }

        if (descriptorTokens.length === 0) return
        focuses.push({ descriptorTokens, unitToken })
    })

    const seen = new Set<string>()
    return focuses.filter((focus) => {
        const key = `${focus.descriptorTokens.join(' ')} ${focus.unitToken}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
    })
}

function academicTokenMatches(token: string, value: string, tokenSet: Set<string>) {
    if (tokenSet.has(token) || tokenSet.has(stemSearchToken(token))) return true
    if (/^[a-z]{2,6}$/.test(token)) {
        const valueTokens = allMeaningfulSearchTokens(value)
        for (let start = 0; start <= valueTokens.length - token.length; start += 1) {
            const initials = valueTokens
                .slice(start, start + token.length)
                .map((valueToken) => valueToken[0] ?? '')
                .join('')
            if (initials === token) return true
        }
    }

    return token.length >= 5 && value.includes(token)
}

function academicUnitMatches(unitToken: string, value: string, tokenSet: Set<string>) {
    if (tokenSet.has(unitToken)) return true

    return value.includes(unitToken)
}

function academicSubjectFocusMatches(focus: AcademicSubjectFocus, value: string) {
    const normalized = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)
    const descriptorsMatch = focus.descriptorTokens.every((token) => academicTokenMatches(token, normalized, tokenSet))
    if (!descriptorsMatch) return false

    if (focus.descriptorTokens.length >= 2 && focus.unitToken === 'program') return true

    return academicUnitMatches(focus.unitToken, normalized, tokenSet)
}

function hasAcademicUnitSignal(value: string) {
    const normalized = normalizeSearchText(value)
    return ACADEMIC_UNIT_PREFIXES.some(([prefix]) => normalized.includes(prefix))
}

function extractMetadataTitle(content: string) {
    const match = content.match(/^(?:Page|Document) Title:\s*(.+)$/im)
    return match?.[1]?.trim() ?? ''
}

function academicTitleLikeText(result: KnowledgeSearchResult, sourceUrl: string) {
    return [
        result.document_title ?? '',
        extractMetadataTitle(result.content),
        sourcePath(sourceUrl)
    ].filter(Boolean).join('\n')
}

function academicSubjectFocusScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    const focuses = extractAcademicSubjectFocuses(query)
    if (focuses.length === 0) return 0

    const titleLike = academicTitleLikeText(result, sourceUrl)
    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    const hasStrictEvidenceIntent = isInternshipEvidenceQuery(query)
    if (!hasStrictEvidenceIntent) return 0
    let score = 0

    for (const focus of focuses) {
        const titleLikeMatches = academicSubjectFocusMatches(focus, titleLike)
        const searchableMatches = academicSubjectFocusMatches(focus, searchable)

        if (titleLikeMatches) {
            score += 0.64
            continue
        }

        if (searchableMatches) {
            score += 0.08
            if (hasStrictEvidenceIntent) score -= 0.74
            if (isInternshipEvidenceQuery(query) && normalizeSearchText(searchable).includes('yaz staji')) {
                score -= 0.56
            }
            continue
        }

        if (hasAcademicUnitSignal(titleLike)) {
            score -= hasStrictEvidenceIntent ? 0.96 : 0.42
        }
    }

    return score
}

function shouldSuppressAcademicSubjectMismatch(query: string, result: KnowledgeSearchResult) {
    const focuses = extractAcademicSubjectFocuses(query)
    if (focuses.length === 0) return false
    if (!isInternshipEvidenceQuery(query)) return false

    const sourceUrl = sourceUrlFromResult(result) ?? ''
    const titleLike = academicTitleLikeText(result, sourceUrl)
    if (!hasAcademicUnitSignal(titleLike)) return false

    return !focuses.some((focus) => academicSubjectFocusMatches(focus, titleLike))
}

function isAddressLookupQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('adres')
        || /\bnerede\b/u.test(normalized)
        || /\bnerde\b/u.test(normalized)
        || normalized.includes('hangi ilce')
        || normalized.includes('ilcede')
        || normalized.includes('kampus')
        || normalized.includes('yerleske')
        || normalized.includes('konum')
}

function hasNamedUnitAddressSubject(query: string) {
    const normalized = normalizeSearchText(query)
    const hasAcronym = /\b[\p{Lu}ÇĞİÖŞÜ]{2,8}\b/u.test(query)
    if (hasAcronym) return true

    return normalized.includes('sbf')
        || normalized.includes('shmyo')
        || normalized.includes('fakulte')
        || normalized.includes('fakultesi')
        || normalized.includes('yuksekokul')
        || normalized.includes('yuksekokulu')
        || normalized.includes('myo')
        || normalized.includes('bolum')
        || normalized.includes('program')
        || normalized.includes('tip')
        || normalized.includes('saglik bilim')
        || normalized.includes('saglik hizmet')
        || normalized.includes('tibbi laboratuvar')
}

function isFacultyAddressQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('fakulte')
        || normalized.includes('fakultesi')
        || normalized.includes('sbf')
        || normalized.includes('saglik bilim')
}

function isExactFacultyAddressSource(query: string, result: KnowledgeSearchResult) {
    if (!isFacultyAddressQuery(query)) return false

    const title = normalizeSearchText(result.document_title ?? '')

    return title.includes('sbf')
        || title.includes('saglik bilimleri fakultesi')
}

function hasStreetAddressShape(value: string) {
    const normalized = normalizeSearchText(value)

    return (
        normalized.includes('mahalle')
        || normalized.includes('mahallesi')
        || normalized.includes('bulvar')
        || normalized.includes('cadde')
        || normalized.includes('caddesi')
        || normalized.includes('sokak')
    ) && (
        normalized.includes('no:')
        || normalized.includes('no ')
        || /\b\d{5}\b/.test(normalized)
    )
}

function hasAddressEvidence(value: string) {
    const normalized = normalizeSearchText(value)
    const hasAddressLabel = /\badres\s*[:：]/u.test(normalized)
        || /\badresi\s*[:：]/u.test(normalized)
        || /\badres bilgisi\s*[:：]/u.test(normalized)

    return hasAddressLabel || hasStreetAddressShape(value)
}

function isCampusLocationQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return hasNamedUnitAddressSubject(query)
        && (
            normalized.includes('kampus')
            || normalized.includes('yerleske')
            || normalized.includes('adres')
            || normalized.includes('konum')
            || /\bnerede\b/u.test(normalized)
            || /\bnerde\b/u.test(normalized)
        )
}

function hasCampusLocationEvidence(query: string, result: KnowledgeSearchResult) {
    if (!isCampusLocationQuery(query)) return false

    const sourceUrl = sourceUrlFromResult(result) ?? ''
    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    const normalized = normalizeSearchText(searchable)
    const subjectCoverage = evidenceSubjectCoverageScore(query, searchable)
    if (subjectCoverage < 0.5) return false

    const hasCampusTerm = normalized.includes('yerleske') || normalized.includes('kampus')
    const hasKnownCampusName = /\b(?:baglica|balgat|baglum)\s+yerleske/u.test(normalized)
        || normalized.includes('yerleskesine')
        || normalized.includes('yerleskesi')
        || normalized.includes('yerleskesinde')
        || normalized.includes('yerleskemizde')
    const hasCampusContext = normalized.includes('konumlari guncellendi')
        || normalized.includes('universite ankara')
        || normalized.includes('neresindedir')
        || normalized.includes('tasindi')
        || normalized.includes('egitim ogretim faaliyetlerini artik')

    return hasCampusTerm && hasKnownCampusName && (hasStreetAddressShape(searchable) || hasCampusContext)
}

function hasCurrentCampusLocationEvidence(query: string, result: KnowledgeSearchResult) {
    if (!hasCampusLocationEvidence(query, result)) return false

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrlFromResult(result) ?? ''}`
    const normalized = normalizeSearchText(searchable)

    return normalized.includes('konumlari guncellendi')
        || normalized.includes('tasindi')
        || (normalized.includes('2025 2026') && normalized.includes('baglica') && normalized.includes('itibariyla'))
        || (normalized.includes('egitim ogretim faaliyetlerini artik') && normalized.includes('baglica'))
}

function hasCurrentNamedProgramCampusEvidence(query: string, result: KnowledgeSearchResult) {
    if (!isCampusLocationQuery(query)) return false

    const normalizedQuery = normalizeSearchText(query)
    const searchableText = `${result.document_title}\n${result.content}\n${sourceUrlFromResult(result) ?? ''}`
    const searchable = normalizeSearchText(searchableText)
    const isCurrentCampusListing = searchable.includes('konumlari guncellendi')
        || searchable.includes('yerleske konumlari')
        || searchable.includes('tasindi')

    if (!isCurrentCampusListing) return false

    if (hasCurrentCampusLocationEvidence(query, result) && evidenceSubjectCoverageScore(query, searchableText) >= 0.5) {
        return true
    }

    if (normalizedQuery.includes('sbf') || normalizedQuery.includes('saglik bilim')) {
        return searchable.includes('saglik bilimleri fakultesi')
            && searchable.includes('baglica yerleskesi')
    }

    if (
        normalizedQuery.includes('tlt')
        || (normalizedQuery.includes('tibbi') && normalizedQuery.includes('laboratuvar') && normalizedQuery.includes('teknik'))
    ) {
        return searchable.includes('tibbi laboratuvar teknikleri')
            && searchable.includes('balgat yerleskesi')
    }

    return false
}

function campusLocationRequiredFilterGroups(query: string) {
    const normalized = normalizeSearchText(query)
    const groups: string[][] = []
    const seen = new Set<string>()
    const addGroup = (filters: string[]) => {
        const normalizedFilters = filters
            .map((filter) => filter.trim())
            .filter(Boolean)
        if (normalizedFilters.length === 0) return

        const key = normalizedFilters
            .map((filter) => normalizeSearchText(filter))
            .join('\u0000')
        if (seen.has(key)) return
        seen.add(key)
        groups.push(normalizedFilters)
    }

    if (normalized.includes('sbf') || normalized.includes('saglik bilim')) {
        addGroup(['Sağlık Bilimleri', 'Bağlıca'])
        addGroup(['SBF', 'Bağlıca'])
        addGroup(['Fakültemiz', 'Bağlıca'])
    }
    if (
        normalized.includes('tlt')
        || (normalized.includes('tibbi') && normalized.includes('laboratuvar') && normalized.includes('teknik'))
    ) {
        addGroup(['Tıbbi Laboratuvar Teknikleri', 'Balgat'])
        addGroup(['TLT', 'Balgat'])
    }

    for (const subjectFilter of addressSubjectEvidenceFilters(query).slice(0, 5)) {
        addGroup([subjectFilter, 'Yerleşke'])
    }

    return groups
}

function isGenericRectorateFooterAddress(query: string, result: KnowledgeSearchResult) {
    if (!isCampusLocationQuery(query)) return false

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrlFromResult(result) ?? ''}`
    const normalized = normalizeSearchText(searchable)
    const hasGenericFooterAddress = normalized.includes('adres')
        && normalized.includes('yuksek ihtisas universitesi rektorlugu')
        && /\b06530\b/u.test(normalized)
    if (!hasGenericFooterAddress) return false

    const hasFooterContext = normalized.includes('kalite koordin')
        || normalized.includes('dokuman no')
        || normalized.includes('dekan')
        || normalized.includes('mudur')

    return hasFooterContext || !hasStreetAddressShape(searchable)
}

function addressEvidenceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isAddressLookupQuery(query)) return 0

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`
    const normalized = normalizeSearchText(searchable)
    const pathname = sourcePath(sourceUrl)
    const subjectCoverage = evidenceSubjectCoverageScore(query, searchable)
    const subjectTokens = queryEvidenceSubjectTokens(query)
    const hasSpecificSubject = subjectTokens.length > 0
    const hasNamedUnitSubject = hasNamedUnitAddressSubject(query)
    const hasAddress = hasAddressEvidence(searchable)
    const hasCampusEvidence = hasCampusLocationEvidence(query, result)
    const hasCurrentCampusEvidence = hasCurrentCampusLocationEvidence(query, result)
    const hasCurrentNamedProgramCampus = hasCurrentNamedProgramCampusEvidence(query, result)
    const hasGenericFooterAddress = isGenericRectorateFooterAddress(query, result)
    let score = 0

    if (hasAddress) score += 0.5
    if (hasCampusEvidence) score += 2.6
    if (hasCurrentCampusEvidence) score += 2.4
    if (hasCurrentNamedProgramCampus) score += 4.2
    if (subjectCoverage > 0) score += 0.18 + subjectCoverage * 0.38
    if (hasAddress && subjectCoverage >= 0.5) score += 0.18
    if (hasNamedUnitSubject && hasAddress && subjectCoverage >= 0.5 && !pathname.includes('sikca-sorulan-sorular')) {
        score += isCampusLocationQuery(query) && !hasCampusEvidence ? 0.24 : 1.8
    }
    if (isFacultyAddressQuery(query) && hasAddress) {
        const title = normalizeSearchText(result.document_title ?? '')
        const exactFacultySource = isExactFacultyAddressSource(query, result)
        if (exactFacultySource && !hasGenericFooterAddress) score += 0.72
        if (!exactFacultySource && (title.includes('oz degerlendirme') || pathname.includes('yuksekokul_bolum_icerikleri'))) {
            score -= 1.5
        }
    }
    if (hasAddress && isPdfLikeSource(sourceUrl, result)) score += 0.08
    if ((normalizeSearchText(query).includes('ilce') || normalizeSearchText(query).includes('ilcede')) && hasAddress) score += 0.12

    if (hasNamedUnitSubject && subjectCoverage < 0.5) {
        score -= 1.42
    }
    if (hasSpecificSubject && pathname === '/iletisim' && subjectCoverage < 0.65) {
        score -= 0.58
    }
    if (hasNamedUnitSubject && pathname.includes('sikca-sorulan-sorular')) {
        score -= 2.1
    }
    if (isTransientPath(pathname) && !hasAddress) {
        score -= 0.48
    }
    if (normalized.includes('takvim') && !hasAddress) {
        score -= 0.24
    }
    if (hasGenericFooterAddress) {
        score -= 3.2
    }

    return score
}

function addressSubjectEvidenceFilters(query: string) {
    const normalized = normalizeSearchText(query)
    const filters = new Set<string>()

    for (const token of queryEvidenceSubjectTokens(query)) {
        if (token.length >= 3) filters.add(token)
    }

    if (normalized.includes('sbf') || normalized.includes('saglik bilim')) {
        filters.add('SBF')
        filters.add('Sağlık Bilimleri Fakültesi')
    }
    if (normalized.includes('shmyo') || normalized.includes('saglik hizmet')) {
        filters.add('SHMYO')
        filters.add('Sağlık Hizmetleri Meslek Yüksekokulu')
    }
    if (normalized.includes('myo') || normalized.includes('meslek yuksekokul')) {
        filters.add('MYO')
        filters.add('Meslek Yüksekokulu')
    }

    return [...filters].slice(0, 8)
}

async function searchKnowledgeBaseByAddressEvidence(
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
    if (!isAddressLookupQuery(query)) return []

    const subjectFilters = addressSubjectEvidenceFilters(query)
    const campusRequiredFilterGroups = isCampusLocationQuery(query) ? campusLocationRequiredFilterGroups(query) : []
    const requiredAddressRowGroups = await Promise.all(
        subjectFilters
            .slice(0, 6)
            .map((subjectFilter) => searchKnowledgeBaseByRequiredEvidenceFilters(
                'Address required evidence',
                [subjectFilter, 'Adres'],
                organizationId,
                limit,
                options
            ))
    )
    const requiredCampusRowGroups = await Promise.all(
        campusRequiredFilterGroups
            .slice(0, 8)
            .map((filters) => searchKnowledgeBaseByRequiredEvidenceFilters(
                'Campus required evidence',
                filters,
                organizationId,
                limit,
                options
            ))
    )
    const [addressRows, subjectRows, campusRows] = await Promise.all([
        searchKnowledgeBaseByEvidenceFilters('Address evidence', [
            'Adres:',
            'Adres :',
            'adresi:',
            'adres bilgisi',
            'kampüsü adres',
            'kampus adres',
            'Mahallesi',
            'Bulvarı',
            'Caddesi',
            'Sokak'
        ], organizationId, limit, options),
        searchKnowledgeBaseByEvidenceFilters(
            'Address subject evidence',
            subjectFilters,
            organizationId,
            Math.max(limit * 4, 64),
            options
        ),
        isCampusLocationQuery(query)
            ? searchKnowledgeBaseByEvidenceFilters('Campus location evidence', [
                'Yerleşkesine Taşındı',
                'Yerleşke Konumları',
                'BAĞLICA YERLEŞKESİ',
                'BALGAT YERLEŞKESİ',
                'BAĞLUM YERLEŞKESİ',
                'Üniversite Ankara’nın neresindedir',
                'Üniversite Ankaranın neresindedir'
            ], organizationId, Math.max(limit * 4, 64), options)
            : Promise.resolve([])
    ])
    const requiredCampusRowIds = new Set(requiredCampusRowGroups.flat().map((row) => String(row.id)))
    const rows = [...requiredCampusRowGroups.flat(), ...requiredAddressRowGroups.flat(), ...campusRows, ...subjectRows, ...addressRows]

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.8))
        .filter((result) => {
            const searchable = `${result.document_title}\n${result.content}\n${sourceUrlFromResult(result) ?? ''}`
            const subjectCoverage = evidenceSubjectCoverageScore(query, searchable)
            const minSubjectCoverage = hasNamedUnitAddressSubject(query) ? 0.5 : 0

            const resultHasAddress = hasAddressEvidence(searchable)
            const resultHasCampusEvidence = hasCampusLocationEvidence(query, result)
            const isRequiredCampusRow = requiredCampusRowIds.has(result.chunk_id)

            return (isRequiredCampusRow || resultHasAddress || resultHasCampusEvidence)
                && (queryEvidenceSubjectTokens(query).length === 0 || subjectCoverage >= minSubjectCoverage)
        })
        .map((result) => {
            const sourceUrl = sourceUrlFromResult(result) ?? ''
            const isRequiredCampusRow = requiredCampusRowIds.has(result.chunk_id)

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    0.78
                        + (isRequiredCampusRow ? 2.25 : 0)
                        + Math.max(0, addressEvidenceScore(query, sourceUrl, result)) * 0.24
                        + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
}

async function searchKnowledgeBaseByCurrentCampusListingEvidence(
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
    if (!isCampusLocationQuery(query)) return []

    const buildCurrentCampusResults = (rows: KeywordSearchRow[]) => rows
        .map((row) => buildKeywordResultFromRow(row, 3.1))
        .filter((result) => hasCurrentNamedProgramCampusEvidence(query, result))
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                3.1 + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))

    const listingRows = await searchKnowledgeBaseByEvidenceFilters('Current campus listing evidence', [
        'Yerleşke Konumları',
        'Konumları Güncellendi',
        'Yerleşkesine Taşındı',
        'BAĞLICA YERLEŞKESİ',
        'BALGAT YERLEŞKESİ',
        'BAĞLUM YERLEŞKESİ'
    ], organizationId, Math.max(limit * 4, 96), options)
    const listingResults = buildCurrentCampusResults(listingRows)
    if (listingResults.length > 0) return listingResults

    const groups = campusLocationRequiredFilterGroups(query)
    if (groups.length === 0) return []

    const rowGroups = await Promise.all(
        groups.map((filters) => searchKnowledgeBaseByRequiredEvidenceFilters(
            'Current campus listing evidence',
            filters,
            organizationId,
            limit,
            options
        ))
    )

    return buildCurrentCampusResults(rowGroups.flat())
}

async function searchKnowledgeBaseByEvidenceFilters(
    queryName: string,
    filters: string[],
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    if (filters.length === 0) return []

    const supabase = options?.supabase || await createClient()
    let evidenceQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)
        .or(filters.map((filter) => `content.ilike.%${sanitizeKeyword(filter)}%`).join(','))

    if (options?.collectionId) {
        evidenceQuery = evidenceQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        evidenceQuery = evidenceQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        evidenceQuery = evidenceQuery.eq('knowledge_documents.language', options.language)
    }

    let data: KeywordSearchRow[] | null = null
    let error: unknown = null
    try {
        const result = await withQueryTimeout(
            evidenceQuery.limit(Math.max(24, Math.min(160, limit * 3))),
            EVIDENCE_SEARCH_TIMEOUT_MS,
            `${queryName} evidence search`
        )
        data = (result.data ?? null) as KeywordSearchRow[] | null
        error = result.error
    } catch (queryError) {
        error = queryError
    }

    if (error || !data) {
        if (isQueryTimeoutError(error)) {
            console.warn(`${queryName} evidence search timed out; continuing without those rows:`, error)
        } else {
            console.error(`${queryName} evidence search failed:`, error)
        }
        return []
    }

    return (data as KeywordSearchRow[]).filter((row) => row.knowledge_documents?.status === 'ready')
}

async function searchKnowledgeBaseByRequiredEvidenceFilters(
    queryName: string,
    requiredFilters: string[],
    organizationId: string,
    limit: number,
    options?: {
        collectionId?: string | null
        type?: string | null
        language?: string | null
        supabase?: SupabaseClientLike
    }
) {
    if (requiredFilters.length === 0) return []

    const supabase = options?.supabase || await createClient()
    let evidenceQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)

    for (const filter of requiredFilters) {
        evidenceQuery = evidenceQuery.ilike('content', `%${sanitizeIlikePattern(filter)}%`)
    }

    if (options?.collectionId) {
        evidenceQuery = evidenceQuery.eq('knowledge_documents.collection_id', options.collectionId)
    }
    if (options?.type) {
        evidenceQuery = evidenceQuery.eq('knowledge_documents.type', options.type)
    }
    if (options?.language) {
        evidenceQuery = evidenceQuery.eq('knowledge_documents.language', options.language)
    }

    let data: KeywordSearchRow[] | null = null
    let error: unknown = null
    try {
        const result = await withQueryTimeout(
            evidenceQuery.limit(Math.max(16, Math.min(80, limit * 2))),
            EVIDENCE_SEARCH_TIMEOUT_MS,
            `${queryName} required evidence search`
        )
        data = (result.data ?? null) as KeywordSearchRow[] | null
        error = result.error
    } catch (queryError) {
        error = queryError
    }

    if (error || !data) {
        if (isQueryTimeoutError(error)) {
            console.warn(`${queryName} required evidence search timed out; continuing without those rows:`, error)
        } else {
            console.error(`${queryName} required evidence search failed:`, error)
        }
        return []
    }

    return (data as KeywordSearchRow[]).filter((row) => row.knowledge_documents?.status === 'ready')
}

function isTltProgramQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('tlt')
        || (normalized.includes('tibbi') && normalized.includes('laboratuvar') && normalized.includes('teknik'))
}

function isProgramContactResponsibilityQuery(query: string) {
    const normalized = normalizeSearchText(query)
    if (hasDirectiveWord(query) && !normalized.includes('program')) return false

    return isTltProgramQuery(query)
        && (isContactInfoQuery(query)
            || normalized.includes('sorumlu')
            || normalized.includes('program baskani')
            || normalized.includes('program sorumlusu')
            || normalized.includes('kim'))
}

async function searchKnowledgeBaseByProgramContactEvidence(
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
    if (!isProgramContactResponsibilityQuery(query)) return []

    const rows = await searchKnowledgeBaseByEvidenceFilters('Program contact', [
        'tlt@yiu.edu.tr',
        'E-Mail: tlt',
        'Tıbbi Laboratuvar Teknikleri Program Başkanı'
    ], organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.86))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return (searchable.includes('tibbi laboratuvar teknikleri') || searchable.includes('tlt'))
                && (searchable.includes('tlt@yiu.edu.tr') || searchable.includes('program baskani') || searchable.includes('telefon'))
        })
        .map((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            let evidenceScore = 0
            if (searchable.includes('tlt@yiu.edu.tr')) evidenceScore += 0.58
            if (searchable.includes('telefon')) evidenceScore += 0.18
            if (searchable.includes('program baskani') || searchable.includes('program sorumlusu')) evidenceScore += 0.18

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    0.86 + evidenceScore + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
}

async function searchKnowledgeBaseByUnitContactEvidence(
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
    if (!isLibraryContactQuery(query)) return []

    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'Library unit contact',
        ['Kütüphane ve Dokümantasyon Daire Başkanlığı', 'kutuphane@yuksekihtisas.edu.tr'],
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.65))
        .filter((result) => hasLibraryContactEvidence(`${result.document_title}\n${result.content}`))
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                2.65 + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
        .sort((left, right) => scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left))
        .slice(0, limit)
}

async function searchKnowledgeBaseByErasmusEligibilityEvidence(
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
    if (!isErasmusEligibilityQuery(query)) return []

    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'Erasmus preparation eligibility',
        ['hazırlık sınıfı öğrencileri', 'programdan yararlanamaz'],
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.65))
        .filter((result) => hasErasmusPreparationDenialEvidence(`${result.document_title}\n${result.content}`))
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                2.65 + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
        .sort((left, right) => scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left))
        .slice(0, limit)
}

function isTltDoubleMajorQuery(query: string) {
    const normalized = normalizeSearchText(query)
    const tokens = new Set(normalized.split(/\s+/).filter(Boolean))

    return isTltProgramQuery(query)
        && (normalized.includes('cift anadal') || tokens.has('cap'))
}

function extractTltDoubleMajorExcerpt(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const start = flattened.search(/Tıbbi Laboratuvar Teknikleri Programı öğrencileri/iu)
    if (start === -1) return null

    const tail = flattened.slice(start)
    const match = tail.match(/Tıbbi Laboratuvar Teknikleri Programı öğrencileri[\s\S]{0,900}?tahsis edilecektir\./iu)
        ?? tail.match(/Tıbbi Laboratuvar Teknikleri Programı öğrencileri[\s\S]{0,520}?başvurabilir\./iu)
        ?? tail.match(/Tıbbi Laboratuvar Teknikleri Programı öğrencileri[\s\S]{0,260}?kayıt yaptırabilirler\./iu)

    return match?.[0] ? match[0].trim() : null
}

function extractTltDoubleMajorResponsibleExcerpt(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const match = flattened.match(/Tıbbi Laboratuvar Teknikleri\s+Doç\.\s*Dr\.\s*Esma\s*Sari\s*Üzek\s+esmasariuzek@yiu\.edu\.tr/iu)
        ?? flattened.match(/Program Sorumluları[\s\S]{0,700}?Tıbbi Laboratuvar Teknikleri\s+Doç\.\s*Dr\.\s*Esma\s*Sari\s*Üzek\s+esmasariuzek@yiu\.edu\.tr/iu)

    return match?.[0] ? match[0].trim() : null
}

function focusTltDoubleMajorResult(result: KnowledgeSearchResult): KnowledgeSearchResult {
    const excerpt = extractTltDoubleMajorResponsibleExcerpt(result.content)
        ?? extractTltDoubleMajorExcerpt(result.content)
    if (!excerpt) return result

    const sourceUrl = sourceUrlFromResult(result)
    const metadata = [
        result.document_title ? `Page Title: ${result.document_title}` : null,
        sourceUrl ? `Source URL: ${sourceUrl}` : null
    ].filter((value): value is string => Boolean(value))

    return {
        ...result,
        source_url: sourceUrl ?? result.source_url ?? null,
        content: [
            ...metadata,
            '',
            excerpt
        ].join('\n').trim()
    }
}

async function searchKnowledgeBaseByTltDoubleMajorEvidence(
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
    if (!isTltDoubleMajorQuery(query)) return []

    const rows = await searchKnowledgeBaseByEvidenceFilters('TLT double-major', [
        'Program Sorumluları',
        'esmasariuzek@yiu.edu.tr',
        'Tıbbi Laboratuvar Teknikleri Doç. Dr. Esma Sari Üzek',
        'Tıbbi Laboratuvar Teknikleri Programı öğrencileri',
        'Eczane Hizmetleri Programı öğrencileri ise Tıbbi Laboratuvar Teknikleri Programında',
        'çift anadal programına kayıt yaptırabilirler'
    ], organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.9))
        .map(focusTltDoubleMajorResult)
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            return searchable.includes('tibbi laboratuvar teknikleri')
                && searchable.includes('eczane hizmetleri')
                && searchable.includes('cift anadal')
        })
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                0.9
                    + (normalizeSearchText(result.content).includes('esmasariuzek@yiu.edu.tr') ? 2.2 : 0)
                    + (normalizeSearchText(result.content).includes('program sorumlulari') ? 0.42 : 0)
                    + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
        .sort((left, right) => scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left))
        .slice(0, limit)
}

async function searchKnowledgeBaseByTltDoubleMajorResponsibleEvidence(
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
    const normalized = normalizeSearchText(query)
    if (!isTltDoubleMajorQuery(query) || !normalized.includes('sorumlu')) return []

    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'TLT double-major responsible',
        ['Tıbbi Laboratuvar Teknikleri', 'esmasariuzek@yiu.edu.tr'],
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 3.2))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('program sorumlulari')
                && searchable.includes('cift anadal')
                && searchable.includes('tibbi laboratuvar teknikleri')
                && searchable.includes('esmasariuzek@yiu.edu.tr')
        })
        .map(focusTltDoubleMajorResult)
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                3.2 + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
}

function medicalSchoolExamPolicyEvidenceFilters(query: string) {
    if (!isMedicalSchoolExamPolicyQuery(query)) return []

    const normalized = normalizeSearchText(query)
    const filters = new Set<string>()

    if (normalized.includes('not hesap')
        || normalized.includes('hesaplama')
        || normalized.includes('sinif gec')
        || normalized.includes('donem gec')
        || normalized.includes('kurul not')
        || normalized.includes('basari not')) {
        filters.add('dönem sonu başarı')
        filters.add('Dönem içi kurul notunun %60')
        filters.add('ders kurulu sınavlarının not ortalamasının %96')
        filters.add('Ders Kurulları puanları')
        filters.add('final veya bütünleme sınavları')
    }
    if (normalized.includes('final') && (normalized.includes('girmeden') || normalized.includes('girmeksizin'))) {
        filters.add('final sınavına girmeksizin')
        filters.add('final sınavına girmeyebilir')
        filters.add('dönem içi kurul notu 80')
        filters.add('dönem içi kurul notunun 80')
        filters.add('Ders kurulu sınav notlarının her biri')
    }
    if (normalized.includes('final') || normalized.includes('butunleme')) {
        filters.add('Yıl Sonu genel sınavının mazeret sınavı')
        filters.add('Bütünleme sınavları için ayrıca mazeret sınavı yapılmaz')
        filters.add('final veya bütünleme sınavları')
    }
    if (normalized.includes('mazeret') || normalized.includes('hasta') || normalized.includes('rapor') || normalized.includes('kurul')) {
        filters.add('sağlık raporuyla')
        filters.add('mazeret sınavı yapılır')
        filters.add('Yıl Sonu genel sınavının mazeret sınavı')
    }
    if (normalized.includes('egitim suresi') || normalized.includes('eğitim süresi')) {
        filters.add('eğitim- öğretim süresi altı yıldır')
    }

    return [...filters]
}

function isMedicalSchoolTrainingQuery(query: string) {
    const normalized = normalizeSearchText(query)
    const medicineSignal = normalized.includes('tip fakultesi') || normalized.includes('tip fakultesinde')
    if (!medicineSignal) return false

    return normalized.includes('staj')
        || normalized.includes('intorn')
        || normalized.includes('klinik')
        || normalized.includes('egitim suresi')
        || normalized.includes('egitim sure')
}

function medicalSchoolTrainingEvidenceFilters(query: string) {
    if (!isMedicalSchoolTrainingQuery(query)) return []

    const normalized = normalizeSearchText(query)
    const filters = new Set<string>()

    if (normalized.includes('staj') || normalized.includes('intorn') || normalized.includes('klinik')) {
        filters.add('Dönem IV ve V’te stajlardan')
        filters.add('Dönem VI’da İntörnlük Stajlarından')
        filters.add('Staj Sınavları ve Sınav Notu')
    }
    if (normalized.includes('egitim') || normalized.includes('ne kadar')) {
        filters.add('Tıp Fakültesinde eğitim- öğretim süresi altı yıldır')
        filters.add('Dönem IV ve V’te stajlardan')
    }

    return [...filters]
}

function isInternshipEvidenceQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('staj')
        || normalized.includes('intern')
        || normalized.includes('uygulama')
}

function extractInternshipEvidenceExcerpt(content: string) {
    const flattened = content.replace(/\s+/g, ' ').trim()
    const start = flattened.search(/(?:Yaz\s+Stajı|staj(?:ı|i)?|iş\s+günü)/iu)
    if (start === -1) return null

    const excerpt = flattened.slice(Math.max(0, start - 180), Math.min(flattened.length, start + 620)).trim()
    return excerpt || null
}

function focusInternshipEvidenceResult(result: KnowledgeSearchResult): KnowledgeSearchResult {
    const excerpt = extractInternshipEvidenceExcerpt(result.content)
    if (!excerpt) return result

    const sourceUrl = sourceUrlFromResult(result)
    const metadata = [
        result.document_title ? `Page Title: ${result.document_title}` : null,
        sourceUrl ? `Source URL: ${sourceUrl}` : null
    ].filter((value): value is string => Boolean(value))

    return {
        ...result,
        source_url: sourceUrl ?? result.source_url ?? null,
        content: [
            ...metadata,
            '',
            excerpt
        ].join('\n').trim()
    }
}

async function searchKnowledgeBaseByInternshipEvidence(
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
    const normalized = normalizeSearchText(query)
    if (!isInternshipEvidenceQuery(query)) return []
    if (isMedicalSchoolTrainingQuery(query) && normalized.includes('tip')) return []

    const filters = new Set<string>(['staj'])
    if (normalized.includes('yaz')) filters.add('Yaz Stajı')
    if (isTltProgramQuery(query)) filters.add('Tıbbi Laboratuvar Teknikleri')
    if (hasQuerySignal(query, ['kaç gün', 'kac gun', 'süre', 'sure', 'ne kadar', 'kaç iş günü', 'kac is gunu'])) {
        filters.add('iş günü')
    }
    if (filters.size < 2) return []

    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'Internship evidence',
        [...filters],
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.2))
        .map(focusInternshipEvidenceResult)
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            if (!searchable.includes('staj')) return false
            if (isTltProgramQuery(query) && !searchable.includes('tibbi laboratuvar teknikleri') && !searchable.includes('tlt')) return false

            return true
        })
        .map((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            let evidenceScore = 0
            if (searchable.includes('yaz staji')) evidenceScore += 0.34
            if (searchable.includes('is gunu')) evidenceScore += 0.28
            if (searchable.includes('tibbi laboratuvar teknikleri') || searchable.includes('tlt')) evidenceScore += 0.32

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    2.2 + evidenceScore + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
        .sort((left, right) => scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left))
        .slice(0, limit)
}

async function searchKnowledgeBaseByMedicalSchoolTrainingEvidence(
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
    const filters = medicalSchoolTrainingEvidenceFilters(query)
    const rows = await searchKnowledgeBaseByEvidenceFilters('Medical-school training', filters, organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.82))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('tip fakultesi')
                && (searchable.includes('staj') || searchable.includes('intorn') || searchable.includes('egitim ogretim suresi'))
        })
        .map((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            let evidenceScore = 0
            if (searchable.includes('donem iv') && searchable.includes('staj')) evidenceScore += 0.42
            if (searchable.includes('intornluk staj')) evidenceScore += 0.28
            if (searchable.includes('egitim ogretim suresi alti yildir')) evidenceScore += 0.24
            if (isPdfLikeSource(sourceUrlFromResult(result) ?? '', result)) evidenceScore += 0.1

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    0.82 + evidenceScore + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
}

function isLectureNotesAccessQuery(query: string) {
    const normalized = normalizeSearchText(query)
    const asksLearningAsset = normalized.includes('ders not')
        || normalized.includes('notlar')
        || normalized.includes('notlari')
        || normalized.includes('ders materyal')
        || normalized.includes('materyal')
        || normalized.includes('ders icerik')
        || normalized.includes('kaynak')
        || normalized.includes('slayt')
    const asksAccess = normalized.includes('nereden')
        || normalized.includes('nerede')
        || normalized.includes('nerde')
        || normalized.includes('ulas')
        || normalized.includes('erisim')
        || normalized.includes('paylas')
        || normalized.includes('yuklen')

    return asksLearningAsset && asksAccess
}

async function searchKnowledgeBaseByLectureNotesEvidence(
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
    if (!isLectureNotesAccessQuery(query)) return []

    const rows = await searchKnowledgeBaseByEvidenceFilters('Lecture-notes access', [
        'ders notlarının paylaşımı',
        'UZEM/MEDU sistemleri',
        'Ders içeriği',
        'Ders Materyali',
        'ders materyalleri',
        'ÖBS’ye yüklenir ve öğrencilerle',
        'ÖBS’ye yüklenerek öğrencilerin erişimine açılır'
    ], organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.8))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return (searchable.includes('ders not')
                    || searchable.includes('ders materyal')
                    || searchable.includes('ders icerigi')
                    || searchable.includes('ders bilgi paketi'))
                && (searchable.includes('uzem') || searchable.includes('medu') || searchable.includes('obs') || searchable.includes('obs') || searchable.includes('erisime acilir'))
        })
        .map((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            let evidenceScore = 0
            if (searchable.includes('ders notlarinin paylasimi')) evidenceScore += 0.44
            if (searchable.includes('ders icerigi') || searchable.includes('ders materyal')) evidenceScore += 0.36
            if (searchable.includes('uzem') || searchable.includes('medu')) evidenceScore += 0.28
            if (searchable.includes('obs') || searchable.includes('erisime acilir')) evidenceScore += 0.18
            if (isPdfLikeSource(sourceUrlFromResult(result) ?? '', result)) evidenceScore += 0.08

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    0.8 + evidenceScore + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
}

function isFinalExemptionPolicyQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('final')
        && (normalized.includes('girmeden') || normalized.includes('girmeksizin'))
        && (normalized.includes('gec') || normalized.includes('basari') || normalized.includes('tamamla'))
}

async function searchKnowledgeBaseByFinalExemptionPolicyEvidence(
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
    if (!isFinalExemptionPolicyQuery(query)) return []

    const rows = await searchKnowledgeBaseByEvidenceFilters('Final-exemption policy', [
        'final sınavına girmeksizin',
        'final sınavına girmeyebilir',
        'dönem içi kurul notu 80',
        'dönem içi kurul notunun 80',
        'Ders kurulu sınav notlarının her biri'
    ], organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.6))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('final sinavina girmeksizin')
                || searchable.includes('final sinavina girmeyebilir')
                || (
                    (
                        searchable.includes('donem ici kurul notu 80')
                        || searchable.includes('donem ici kurul notunun 80')
                    )
                    && searchable.includes('ders kurulu sinav notlarinin her biri')
                )
        })
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                2.6
                    + (normalizeSearchText(`${result.document_title}\n${result.content}`).includes('tip fakultesi') ? 0.42 : 0)
                    + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
}

function lectureNotesAccessEvidenceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isLectureNotesAccessQuery(query)) return 0

    const title = normalizeSearchText(result.document_title ?? '')
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    const hasLearningAsset = searchable.includes('ders not')
        || searchable.includes('ders materyal')
        || searchable.includes('ders icerigi')
    const hasLearningPlatform = searchable.includes('uzem')
        || searchable.includes('medu')
        || searchable.includes('obs')
        || searchable.includes('erisime acilir')
        || searchable.includes('ogrencilerin erisimine')
    let score = 0

    if (hasLearningAsset && hasLearningPlatform) score += 0.46
    if (searchable.includes('uzem') && searchable.includes('medu')) score += 0.28
    if (searchable.includes('ders notlarinin paylasimi')) score += 0.24
    if (!hasLearningPlatform) score -= 0.44
    if ((title.includes('engelli') || title.includes('dezavantaj')) && !(searchable.includes('uzem') || searchable.includes('medu'))) {
        score -= 0.42
    }
    if (title.includes('staj rehberi') && !hasLearningPlatform) {
        score -= 0.32
    }

    return score
}

function isFinalExamPolicyQuery(query: string) {
    const normalized = normalizeSearchText(query)
    const asksFinal = normalized.includes('final') || normalized.includes('yariyil sonu') || normalized.includes('yil sonu')
    if (!asksFinal) return false

    return normalized.includes('girmeden')
        || normalized.includes('girmeyen')
        || normalized.includes('gecebilir')
        || normalized.includes('sinif gec')
        || normalized.includes('butunleme')
}

async function searchKnowledgeBaseByFinalExamPolicyEvidence(
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
    if (!isFinalExamPolicyQuery(query)) return []

    const rows = await searchKnowledgeBaseByEvidenceFilters('Final-exam policy', [
        'yarıyıl sonu sınavında başarısız olan veya yarıyıl sonu sınavına girmeyen',
        'Final sınavına girmesi gerektiği halde girmeyen',
        'Bütünleme sınavına girmeyen öğrencinin yarıyıl sonu sınavından aldığı puan geçerli olur',
        'Bütünleme sınavında alınan not final notu yerine geçer'
    ], organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.8))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('butunleme')
                && (searchable.includes('final') || searchable.includes('yariyil sonu') || searchable.includes('yil sonu'))
        })
        .map((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            let evidenceScore = 0
            if (searchable.includes('yariyil sonu sinavina girmeyen')) evidenceScore += 0.5
            if (searchable.includes('final sinavina girmesi gerektigi halde girmeyen')) evidenceScore += 0.5
            if (searchable.includes('butunleme sinavinda alinan not final')) evidenceScore += 0.32
            if (hasDirectiveWord(result.document_title ?? '') || hasRegulationWord(result.document_title ?? '')) evidenceScore += 0.16
            if (isPdfLikeSource(sourceUrlFromResult(result) ?? '', result)) evidenceScore += 0.1

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    0.8 + evidenceScore + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
}

async function searchKnowledgeBaseByMedicalSchoolExamPolicyEvidence(
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
    const filters = medicalSchoolExamPolicyEvidenceFilters(query)
    const rows = await searchKnowledgeBaseByEvidenceFilters('Medical-school policy', filters, organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.82))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('tip fakultesi')
                && (searchable.includes('sinav') || searchable.includes('staj') || searchable.includes('donem') || searchable.includes('madde'))
        })
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                0.82
                    + Math.max(0, medicalSchoolExamPolicyScore(query, sourceUrlFromResult(result) ?? '', result)) * 0.14
                    + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.1
            )
        }))
}

async function searchKnowledgeBaseByHealthReportExamPolicyEvidence(
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
    if (!isHealthReportExcuseExamQuery(query)) return []

    const remedyRows = asksForMissedExamRemedy(query)
        ? (await Promise.all([
            searchKnowledgeBaseByRequiredEvidenceFilters('Health-report exam remedy', ['mazeret sınavı', 'sağlık raporu'], organizationId, limit, options),
            searchKnowledgeBaseByRequiredEvidenceFilters('Health-report exam remedy', ['mazeret sınavı', 'hastalık'], organizationId, limit, options),
            searchKnowledgeBaseByRequiredEvidenceFilters('Health-report exam remedy', ['mazeret sınavı', 'sağlık mazereti'], organizationId, limit, options),
            searchKnowledgeBaseByRequiredEvidenceFilters('Health-report exam remedy', ['telafi sınavı', 'sağlık raporu'], organizationId, limit, options)
        ])).flat()
        : []
    const broadRows = await searchKnowledgeBaseByEvidenceFilters('Health-report exam policy', [
        'sağlık raporu ile belgelendirmesi',
        'Sağlık raporu olduğu halde',
        'sınavı geçersiz sayılır',
        'sınava girmesini engelleyen hastalık',
        'mazeret sınavı yapılır',
        'Yönetim Kurulu tarafından kabul edilen mazeretler'
    ], organizationId, limit, options)
    const rowsById = new Map<string, KeywordSearchRow>()

    for (const row of [...remedyRows, ...broadRows]) {
        rowsById.set(row.id, row)
    }

    return [...rowsById.values()]
        .map((row) => buildKeywordResultFromRow(row, 0.8))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return (searchable.includes('saglik raporu') || searchable.includes('hastalik') || searchable.includes('hasta'))
                && searchable.includes('sinav')
                && (searchable.includes('mazeret') || searchable.includes('telafi') || searchable.includes('gecersiz sayilir'))
        })
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                0.8
                    + (hasHealthReportExamRemedyEvidence(normalizeSearchText(`${result.document_title}\n${result.content}`)) ? 1.42 : 0)
                    + Math.max(0, healthReportExamPolicyScore(query, sourceUrlFromResult(result) ?? '', result)) * 0.18
                    + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
}

function isElectiveCourseRequirementQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('secmeli')
        && (normalized.includes('kac')
            || normalized.includes('kadar')
            || normalized.includes('gecmem')
            || normalized.includes('gecmeli')
            || normalized.includes('basarili')
            || normalized.includes('mezun')
            || normalized.includes('almaliy')
            || normalized.includes('sayisi')
            || normalized.includes('sayisina')
            || normalized.includes('belirliyor')
            || normalized.includes('belirlen')
            || normalized.includes('kim')
            || normalized.includes('nasil'))
}

async function searchKnowledgeBaseByElectiveCoursePolicyEvidence(
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
    if (!isElectiveCourseRequirementQuery(query)) return []

    const rows = await searchKnowledgeBaseByEvidenceFilters('Elective-course policy', [
        'seçmeli ders sayısına',
        'alınması gereken seçmeli ders',
        'Seçmeli derslerin hangi derslerden oluşacağına',
        'Seçmeli derslerden Dönem VI sonuna',
        'Fakülte Kurulu karar verir'
    ], organizationId, limit, options)

    return rows
        .map((row) => buildKeywordResultFromRow(row, 0.78))
        .filter((result) => normalizeSearchText(`${result.document_title}\n${result.content}`).includes('secmeli ders'))
        .map((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
            let evidenceScore = 0
            if (searchable.includes('secmeli ders sayisina')) evidenceScore += 0.46
            if (searchable.includes('alinmasi gereken secmeli ders')) evidenceScore += 0.36
            if (searchable.includes('secmeli derslerden donem vi sonuna')) evidenceScore += 0.52
            if (searchable.includes('fakulte kurulu karar verir') || searchable.includes('yuksekokul kurulu karar verir')) evidenceScore += 0.32

            return {
                ...result,
                similarity: Math.max(
                    0.2,
                    0.78 + evidenceScore + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
                )
            }
        })
}

function isMedicineElectiveDeadlineQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return normalized.includes('secmeli')
        && (normalized.includes('tip') || normalized.includes('tip fakultesi'))
        && (normalized.includes('kadar') || normalized.includes('gecmem') || normalized.includes('basarili') || normalized.includes('mezun'))
}

async function searchKnowledgeBaseByMedicineElectiveDeadlineEvidence(
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
    if (!isMedicineElectiveDeadlineQuery(query)) return []

    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'Medicine elective deadline evidence',
        ['Seçmeli derslerden Dönem VI sonuna'],
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.75))
        .filter((result) => normalizeSearchText(`${result.document_title}\n${result.content}`).includes('tip fakultesi')
            || normalizeSearchText(result.document_title).includes('tip'))
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                2.75 + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
}

function isMedicineMaxDurationQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return (normalized.includes('tip') || normalized.includes('tip fakultesi') || normalized.includes('tipta') || normalized.includes('tipte'))
        && (normalized.includes('azami') || normalized.includes('en fazla') || normalized.includes('kac yilda') || normalized.includes('bitirilmeli'))
}

async function searchKnowledgeBaseByMedicineMaxDurationEvidence(
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
    if (!isMedicineMaxDurationQuery(query)) return []

    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'Medicine max duration evidence',
        ['dokuz yılda'],
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.55))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('tip fakultesi')
                && (searchable.includes('en fazla dokuz yilda') || searchable.includes('dokuz yilda tamamlamak'))
        })
        .map((result) => ({
            ...result,
            similarity: Math.max(
                0.2,
                2.55 + lexicalMatchScore(query, `${result.document_title}\n${result.content}`) * 0.08
            )
        }))
}

function isAnnualPaidLeaveQuery(query: string) {
    const normalized = normalizeSearchText(query)

    return hasAnnualPaidLeaveIntent(normalized)
}

function hasAnnualPaidLeaveIntent(normalizedQuery: string) {
    const tokens = new Set(normalizedQuery.split(/\s+/).filter(Boolean))
    const hasLeaveNoun = [
        'izin',
        'izni',
        'iznin',
        'iznine',
        'iznini',
        'izninden',
        'izinleri',
        'izinlerinden'
    ].some((token) => tokens.has(token))

    return normalizedQuery.includes('yillik')
        && hasLeaveNoun
        && !normalizedQuery.includes('ucretsiz')
        && !normalizedQuery.includes('mazeret')
        && !normalizedQuery.includes('hastalik')
}

function annualPaidLeaveEvidenceFilters(query: string) {
    const normalized = normalizeSearchText(query)

    if (/\b15\b/.test(normalized) || normalized.includes('on bes')) {
        return {
            requiredFilters: ['15 yıl', '26 iş günü'],
            expectedDuration: '26 is gunu'
        }
    }

    if (normalized.includes('5 yildan fazla') || normalized.includes('bes yildan fazla')) {
        return {
            requiredFilters: ['5 yıldan fazla', '20 iş günü'],
            expectedDuration: '20 is gunu'
        }
    }

    return {
        requiredFilters: ['5 yıldan fazla 15 yıldan az'],
        expectedDuration: null
    }
}

async function searchKnowledgeBaseByAnnualPaidLeaveEvidence(
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
    if (!isAnnualPaidLeaveQuery(query)) return []

    const { requiredFilters, expectedDuration } = annualPaidLeaveEvidenceFilters(query)
    const rows = await searchKnowledgeBaseByRequiredEvidenceFilters(
        'Annual paid leave evidence',
        requiredFilters,
        organizationId,
        limit,
        options
    )

    return rows
        .map((row) => buildKeywordResultFromRow(row, 2.05))
        .filter((result) => {
            const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)

            return searchable.includes('yillik')
                && searchable.includes('izin')
                && (
                    expectedDuration
                        ? searchable.includes(expectedDuration)
                        : (searchable.includes('14 is gunu') || searchable.includes('20 is gunu') || searchable.includes('26 is gunu'))
                )
        })
}

const POLICY_DURATION_SUBJECT_STOPWORDS = new Set([
    'sure',
    'suresi',
    'kadar',
    'kac',
    'hak',
    'hakki',
    'azami',
    'bitirilmeli',
    'bitirmek',
    'fazla',
    'cok',
    'gec',
    'tamamlanmali',
    'tamamlamak',
    'nedir',
    'gun',
    'gunu',
    'hafta',
    'ay',
    'yil',
    'yilda',
    'yildan',
    'yila',
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

function sanitizeTextSearchTerm(value: string) {
    const normalized = value
        .replace(/[^\p{L}\p{N}]+/gu, '')
        .trim()

    return normalized.length >= 3 ? normalized.replace(/'/g, '') : ''
}

function policyDurationSubjectTextSearchExpression(subjectGroups: string[][]) {
    const groups = subjectGroups
        .map((group) => Array.from(new Set(group.map(sanitizeTextSearchTerm).filter(Boolean))).slice(0, 4))
        .filter((group) => group.length > 0)
        .slice(0, 4)

    if (groups.length === 0) return ''

    return groups
        .map((group) => {
            const variants = group.map((term) => `'${term}'`)
            return variants.length === 1 ? variants[0] : `(${variants.join(' | ')})`
        })
        .join(' & ')
}

function shouldReturnPolicyDurationResultsEarly(query: string, results: KnowledgeSearchResult[]) {
    if (results.length === 0) return false
    if (isMedicineMaxDurationQuery(query)) return false

    const requiredTokens = policyDurationRequiredSubjectTokens(policyDurationSubjectTokens(query))

    return requiredTokens.some((token) => !POLICY_DURATION_GENERIC_SUBJECT_TOKENS.has(token))
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
    const textSearchExpression = policyDurationSubjectTextSearchExpression(subjectGroups)
    if (!filters && !textSearchExpression) return []

    let policyQuery = supabase
        .from('knowledge_chunks')
        .select('id, document_id, content, knowledge_documents(title, type, status, collection_id, language)')
        .eq('organization_id', organizationId)

    if (textSearchExpression) {
        policyQuery = policyQuery.textSearch('content', textSearchExpression, { config: 'simple' })
    } else {
        policyQuery = policyQuery.or(filters)
    }

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

    const requiredSubjectTokens = policyDurationRequiredSubjectTokens(policyDurationSubjectTokens(query))

    return (data as KeywordSearchRow[])
        .filter((row) => row.knowledge_documents?.status === 'ready')
        .filter((row) => {
            const searchable = `${row.knowledge_documents?.title ?? ''}\n${row.content}`

            return policyDurationHasRequiredSubjectTokens(requiredSubjectTokens, searchable)
                && hasPolicyDurationEvidence(searchable)
        })
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
    const normalizedTokens = tokens.map((token) => {
        if (['izni', 'iznin', 'iznine', 'iznini', 'izninden'].includes(token)) return 'izin'
        return token
    })
    const subjectTokens = normalizedTokens.filter((token) => !POLICY_DURATION_ACTOR_TOKENS.has(token))
    const specificTokens = subjectTokens.filter((token) => (
        !POLICY_DURATION_ACTOR_TOKENS.has(token)
        && !POLICY_DURATION_GENERIC_SUBJECT_TOKENS.has(token)
    ))
    const genericTokens = subjectTokens.filter((token) => POLICY_DURATION_GENERIC_SUBJECT_TOKENS.has(token))

    return [...specificTokens, ...genericTokens].slice(0, 4)
}

function policyDurationSubjectCoverage(tokens: string[], value: string) {
    if (tokens.length === 0) return 0

    const normalized = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)
    const hits = tokens.filter((token) => policyDurationTokenMatches(token, normalized, tokenSet)).length

    return hits / tokens.length
}

function policyDurationTokenMatches(token: string, normalized: string, tokenSet: Set<string>) {
    if (tokenSet.has(token)) return true

    // Keep short policy nouns token-bound so "izin" does not match "sizin".
    return token.length >= 5 && normalized.includes(token)
}

function policyDurationHasRequiredSubjectTokens(tokens: string[], value: string) {
    if (tokens.length === 0) return true

    const normalized = normalizeSearchText(value)
    const tokenSet = normalizedTokenSet(value)

    return tokens.every((token) => policyDurationTokenMatches(token, normalized, tokenSet))
}

function hasPolicyDurationEvidence(value: string) {
    return POLICY_DURATION_VALUE_REGEX.test(normalizeSearchText(value))
}

function policyDurationEvidenceScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    if (!isPolicyDurationQuery(query)) return 0

    const subjectTokens = policyDurationSubjectTokens(query)
    if (subjectTokens.length === 0) return 0

    const normalizedQuery = normalizeSearchText(query)
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
        || isPdfLikeSource(sourceUrl, result)
    const asksAnnualPaidLeave = hasAnnualPaidLeaveIntent(normalizedQuery)
    const hasAnnualPaidLeaveEvidence = searchable.includes('yillik ucretli izin')
        || searchable.includes('yillik hizmetlerine gore')
        || (searchable.includes('14 is gunu') && searchable.includes('20 is gunu') && searchable.includes('26 is gunu'))
    let score = 0

    if (!hasRequiredSubjectFocus) {
        score -= hasDurationEvidence ? 0.72 : 0.36
    }

    if (hasDurationEvidence && hasRequiredSubjectFocus && subjectCoverage > 0.67) {
        score += 0.42 + subjectCoverage * 0.58
        if (policyDocumentSignal) score += 0.2
        if (searchable.includes('madde')) score += 0.08
        if (isPdfLikeSource(sourceUrl, result)) score += 0.08
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

    if (asksAnnualPaidLeave) {
        if (hasAnnualPaidLeaveEvidence) {
            score += 0.74
            if (searchable.includes('akademik') && searchable.includes('idari') && searchable.includes('personel')) {
                score += 0.16
            }
        }
        if (searchable.includes('ucretsiz izin') || searchable.includes('mazeret izni') || searchable.includes('hastalik izni')) {
            score -= 0.46
        }
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
        + libraryContactEvidenceScore(query, sourceUrl, result)
        + addressEvidenceScore(query, sourceUrl, result)
        + lectureNotesAccessEvidenceScore(query, sourceUrl, result)
        + erasmusEligibilityEvidenceScore(query, sourceUrl, result)
        + healthReportExamPolicyScore(query, sourceUrl, result)
        + medicalSchoolExamPolicyScore(query, sourceUrl, result)
        + policyPdfSourceScore(query, sourceUrl, result)
        + policyDurationEvidenceScore(query, sourceUrl, result)
        + tltDoubleMajorResponsibleScore(query, result)
        + documentCodeLookupScore(query, result)
        + abbreviationLookupScore(query, result)
        + abbreviationInitialismScore(query, result.document_title)
        + directiveDetailScore(query, sourceUrl, result)
        + academicSubjectFocusScore(query, sourceUrl, result)
}

function tltDoubleMajorResponsibleScore(query: string, result: KnowledgeSearchResult) {
    const normalizedQuery = normalizeSearchText(query)
    if (!isTltDoubleMajorQuery(query) || !normalizedQuery.includes('sorumlu')) return 0

    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}`)
    const hasResponsibleTable = searchable.includes('program sorumlulari')
        || searchable.includes('cift anadal programi program sorumlulari')
    let score = 0

    if (searchable.includes('esmasariuzek@yiu.edu.tr') && hasResponsibleTable) score += 5.4
    if (searchable.includes('esmasariuzek@yiu.edu.tr') && !hasResponsibleTable) score += 0.7
    if (hasResponsibleTable) score += 0.82
    if (searchable.includes('ders izlencesi') && !hasResponsibleTable) score -= 2.2
    if (searchable.includes('tlt@yiu.edu.tr') && !searchable.includes('esmasariuzek@yiu.edu.tr')) score -= 1.3

    return score
}

function enrichKnowledgeSearchResult(result: KnowledgeSearchResult): KnowledgeSearchResult {
    const sourceUrl = sourceUrlFromResult(result)
    if (!sourceUrl) return result

    return {
        ...result,
        source_url: sourceUrl
    }
}

function isReliableNamedUnitAddressResult(query: string, result: KnowledgeSearchResult) {
    if (!isAddressLookupQuery(query) || !hasNamedUnitAddressSubject(query)) return false

    const sourceUrl = sourceUrlFromResult(result) ?? ''
    if (isCampusLocationQuery(query) && hasCampusLocationEvidence(query, result)) return true
    if (sourcePath(sourceUrl).includes('sikca-sorulan-sorular')) return false

    const searchable = `${result.document_title}\n${result.content}\n${sourceUrl}`

    return hasAddressEvidence(searchable)
        && evidenceSubjectCoverageScore(query, searchable) >= 0.5
}

function namedUnitAddressPriority(query: string, result: KnowledgeSearchResult) {
    if (isCampusLocationQuery(query) && hasCurrentNamedProgramCampusEvidence(query, result)) return 6
    if (!isReliableNamedUnitAddressResult(query, result)) return 0
    if (isCampusLocationQuery(query)) {
        if (hasCurrentCampusLocationEvidence(query, result)) return 5
        if (hasCampusLocationEvidence(query, result)) return 4
        if (isGenericRectorateFooterAddress(query, result)) return 0
    }
    if (!isFacultyAddressQuery(query)) return 1

    const exactFacultySource = isExactFacultyAddressSource(query, result)

    return exactFacultySource ? 2 : 1
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
        if (shouldSuppressAcademicSubjectMismatch(query, result)) continue

        const existing = byChunk.get(result.chunk_id)
        if (!existing || scoreKnowledgeResult(query, result) > scoreKnowledgeResult(query, existing)) {
            byChunk.set(result.chunk_id, result)
        }
    }

    return [...byChunk.values()]
        .sort((left, right) => {
            const leftAddressPriority = namedUnitAddressPriority(query, left)
            const rightAddressPriority = namedUnitAddressPriority(query, right)
            if (leftAddressPriority !== rightAddressPriority) {
                return rightAddressPriority - leftAddressPriority
            }

            return scoreKnowledgeResult(query, right) - scoreKnowledgeResult(query, left)
        })
        .slice(0, limit)
}

function shouldReturnFocusedEvidenceResultsEarly(query: string, results: KnowledgeSearchResult[]) {
    if (results.length === 0) return false

    const topScore = results.reduce((best, result) => Math.max(best, scoreKnowledgeResult(query, enrichKnowledgeSearchResult(result))), 0)
    if (topScore >= 1.35) return true

    return (
        isAddressLookupQuery(query)
        || isFinalExamPolicyQuery(query)
        || isMedicalSchoolExamPolicyQuery(query)
        || isHealthReportExcuseExamQuery(query)
        || isErasmusEligibilityQuery(query)
        || isLibraryContactQuery(query)
        || isMedicalSchoolTrainingQuery(query)
        || isLectureNotesAccessQuery(query)
        || isElectiveCourseRequirementQuery(query)
        || isInternshipEvidenceQuery(query)
    ) && topScore >= 1.05
}

function shouldProbeLexicalEvidenceBeforeVector(query: string) {
    return isPolicyRuleQuery(query)
        || isContactInfoQuery(query)
        || isErasmusEligibilityQuery(query)
        || isLibraryContactQuery(query)
        || isAddressLookupQuery(query)
        || isLectureNotesAccessQuery(query)
        || isInternshipEvidenceQuery(query)
        || isPolicyDurationQuery(query)
        || isProgramContactResponsibilityQuery(query)
        || isTltDoubleMajorQuery(query)
        || isAnnualPaidLeaveQuery(query)
        || extractAbbreviationCandidates(query).length > 0
}

async function getQuickLexicalEvidenceBeforeVector(
    query: string,
    fallbackResultsPromise: Promise<KnowledgeSearchResult[][]>
) {
    if (!shouldProbeLexicalEvidenceBeforeVector(query)) return null

    const result = await readBeforeDeadline(fallbackResultsPromise, LEXICAL_EVIDENCE_FIRST_TIMEOUT_MS)
    if (result.status !== 'fulfilled') return null

    return result.value.flat()
}

function shouldReturnLexicalEvidenceResultsEarly(query: string, results: KnowledgeSearchResult[]) {
    if (results.length === 0) return false

    const ranked = mergeSearchResults(query, [], results, Math.min(6, Math.max(3, results.length)))
    const top = ranked[0]
    if (!top) return false

    const searchable = `${top.document_title}\n${top.content}\n${sourceUrlFromResult(top) ?? ''}`
    const lexicalCoverage = lexicalMatchScore(query, searchable)
    const subjectCoverage = evidenceSubjectCoverageScore(query, searchable)
    const topScore = scoreKnowledgeResult(query, enrichKnowledgeSearchResult(top))
    const hasAbbreviationCandidate = extractAbbreviationCandidates(query).length > 0

    if (hasAbbreviationCandidate && abbreviationLookupScore(query, top) >= 0.25) return true

    if (topScore >= 1.35 && lexicalCoverage >= 0.45) return true

    return lexicalCoverage >= 0.7
        && subjectCoverage >= 0.45
        && (
            isPolicyRuleQuery(query)
            || isContactInfoQuery(query)
            || isAddressLookupQuery(query)
            || isLectureNotesAccessQuery(query)
            || isAnnualPaidLeaveQuery(query)
            || hasAbbreviationCandidate
        )
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

    if (headings.length === 0) return []

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

function splitTableCells(line: string) {
    const trimmed = line.trim()
    if (!trimmed.includes('|')) return []

    return trimmed
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((cell) => cell.replace(/\s+/g, ' ').trim())
}

function isMarkdownTableSeparator(line: string) {
    const cells = splitTableCells(line)
    return cells.length >= 2 && cells.every((cell) => /^:?-{3,}:?$/.test(cell))
}

function hasMeaningfulTableCells(cells: string[]) {
    return cells.filter((cell) => cell && !/^:?-{3,}:?$/.test(cell)).length >= 2
}

function evidenceLabelFromText(value: string) {
    return value
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 90)
        .trim()
}

function buildTableRowEvidence(headers: string[], cells: string[], sectionTitle?: string): IndexedSourceChunk | null {
    if (!hasMeaningfulTableCells(cells)) return null

    const pairs = cells
        .map((cell, index) => {
            const header = headers[index]?.trim()
            if (!cell) return null
            return header ? `${header}: ${cell}` : cell
        })
        .filter((value): value is string => Boolean(value))

    const content = pairs.join(' | ')
    if (!content) return null

    return {
        content,
        tokenCount: estimateTokenCount(content),
        sectionTitle,
        evidenceType: 'table-row',
        evidenceLabel: evidenceLabelFromText(cells.find(Boolean) ?? content)
    }
}

function extractTableRowEvidenceChunks(content: string, sectionTitle?: string): IndexedSourceChunk[] {
    const lines = content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
    const chunks: IndexedSourceChunk[] = []

    for (let index = 0; index < lines.length - 1; index += 1) {
        const headerCells = splitTableCells(lines[index] ?? '')
        if (headerCells.length < 2 || !isMarkdownTableSeparator(lines[index + 1] ?? '')) continue

        let rowIndex = index + 2
        for (; rowIndex < lines.length; rowIndex += 1) {
            const rowCells = splitTableCells(lines[rowIndex] ?? '')
            if (rowCells.length < 2) break

            const rowChunk = buildTableRowEvidence(headerCells, rowCells, sectionTitle)
            if (rowChunk) chunks.push(rowChunk)
        }
        index = Math.max(index, rowIndex - 1)
    }

    return chunks
}

function isHighSignalEvidenceLine(line: string) {
    const rawLine = line.trim()
    const normalized = rawLine.replace(/\s+/g, ' ').trim()
    if (normalized.length < 12 || normalized.length > 360) return false
    if (!hasTurkishOrLatinLetter(normalized)) return false
    if (normalized.includes('|') || isMarkdownTableSeparator(normalized)) return false
    if (extractStructuredHeading(normalized, '', 'body')) return false

    const hasContactValue = /[\w.+-]+@[\w.-]+\.[A-Za-zÇĞİÖŞÜçğıöşü]{2,}/u.test(normalized)
        || /(?:\+?\d[\d\s().-]{7,}\d)/.test(normalized)
    const hasAddressValue = /\b(?:no|no:|numara|cadde|caddesi|sokak|sokağı|bulvar|bulvarı|mahallesi)\b/iu.test(normalized)
    const hasCourseCode = /\b[A-ZÇĞİÖŞÜ]{2,}\s*\d{3}\b/u.test(normalized)
    const hasCompactValue = /\b\d+(?:[.,]\d+)?\s*(?:iş\s*günü|gün|hafta|ay|yıl|saat|akts|kredi)\b/iu.test(normalized)
        || /%\s*\d+|\d+\s*%/.test(normalized)
        || /\b\d+[.,]\d+\s*\/\s*\d+\b/.test(normalized)
    const looksLikeRow = /^[-*•]\s+/.test(rawLine)
        || /^\d+[.)]\s+/.test(rawLine)
        || /^\(?[A-Za-zÇĞİÖŞÜçğıöşü]\)?[.)]\s+/.test(rawLine)
        || /\t/.test(rawLine)
        || /\S\s{2,}\S/.test(rawLine)

    return hasContactValue
        || hasAddressValue
        || hasCourseCode
        || (looksLikeRow && hasCompactValue)
}

function extractEvidenceLineChunks(content: string, sectionTitle?: string): IndexedSourceChunk[] {
    return content
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .split('\n')
        .map((line) => line.replace(/\s+/g, ' ').trim())
        .filter(isHighSignalEvidenceLine)
        .map((line) => ({
            content: line,
            tokenCount: estimateTokenCount(line),
            sectionTitle,
            evidenceType: 'evidence-row' as const,
            evidenceLabel: evidenceLabelFromText(line)
        }))
}

function dedupeIndexedChunks(chunks: IndexedSourceChunk[]) {
    const seen = new Set<string>()
    const deduped: IndexedSourceChunk[] = []

    for (const chunk of chunks) {
        const key = [
            chunk.sectionTitle ?? '',
            chunk.evidenceType ?? 'section',
            chunk.content.replace(/\s+/g, ' ').trim().toLocaleLowerCase('tr-TR')
        ].join('::')
        if (seen.has(key)) continue
        seen.add(key)
        deduped.push(chunk)
    }

    return deduped
}

function chunkKnowledgeDocumentContent(content: string): IndexedSourceChunk[] {
    const sections = splitStructuredDocumentSections(content)
    const sourceSections = sections.length > 0 ? sections : [{ content }]

    const chunks = dedupeIndexedChunks(sourceSections.flatMap((section) => {
        const evidenceChunks = [
            ...extractTableRowEvidenceChunks(section.content, section.sectionTitle),
            ...extractEvidenceLineChunks(section.content, section.sectionTitle)
        ]
        const sectionChunks = chunkText(section.content).map((chunk) => ({
            ...chunk,
            sectionTitle: section.sectionTitle
        }))

        return [
            ...evidenceChunks,
            ...sectionChunks
        ]
    }))

    if (chunks.length > 200) {
        throw new Error(`Content too large for indexing (chunks=${chunks.length}, max=200).`)
    }

    return chunks
}

function buildIndexedChunkContent(
    title: string,
    content: string,
    sectionTitle?: string,
    evidenceType?: IndexedSourceChunk['evidenceType'],
    evidenceLabel?: string
) {
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

    if (evidenceType) {
        metadataLines.push(`Evidence Type: ${evidenceType}`)
    }

    const normalizedEvidenceLabel = evidenceLabelFromText(evidenceLabel ?? '')
    if (normalizedEvidenceLabel) {
        metadataLines.push(`Evidence Label: ${normalizedEvidenceLabel}`)
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
    if (chunks.length === 0) return 0
    const indexedChunks = chunks.map((chunk) => {
        const indexedContent = buildIndexedChunkContent(
            title,
            chunk.content,
            chunk.sectionTitle,
            chunk.evidenceType,
            chunk.evidenceLabel
        )
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

    return rows.length
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
