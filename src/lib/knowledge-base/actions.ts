'use server'

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding, generateEmbeddings, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import { chunkText } from '@/lib/knowledge-base/chunking'
import {
    appendServiceCatalogCandidates,
    appendOfferingProfileSuggestion,
    appendRequiredIntakeFields
} from '@/lib/leads/offering-profile'
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
type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>
type KnowledgeCountRow = { collection_id: string | null }
type KnowledgeFileRow = Pick<KnowledgeBaseEntry, 'id' | 'title' | 'type'> & { collection_id: string | null }
const MAX_PROFILE_CONTEXT_CHARS = 6000

interface KnowledgeSearchResult {
    chunk_id: string
    document_id: string
    document_title: string
    document_type: string
    content: string
    similarity: number
}

interface KeywordSearchRow {
    id: string
    document_id: string
    content: string
    knowledge_documents?: {
        title?: string | null
        type?: string | null
        status?: string | null
    } | null
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

    // Get counts for each collection
    // This could be optimized with a join/count query but for now this is simple and robust with RLS
    let countsQuery = supabase
        .from('knowledge_documents')
        .select('collection_id')
    if (scopedOrganizationId) {
        countsQuery = countsQuery.eq('organization_id', scopedOrganizationId)
    }

    const { data: counts, error: countError } = await countsQuery

    if (countError) throw new Error(countError.message)

    // Map counts
    const countMap = new Map<string, number>()
    ;(counts ?? []).forEach((item: KnowledgeCountRow) => {
        if (item.collection_id) {
            countMap.set(item.collection_id, (countMap.get(item.collection_id) || 0) + 1)
        }
    })

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

export async function createKnowledgeBaseEntry(entry: KnowledgeBaseInsert) {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)
    const organizationId = await getUserOrganization(supabase)

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
    return data as KnowledgeBaseEntry
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
        await buildAndStoreChunks(supabase, data.organization_id, data.id, data.content ?? '')
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

export async function getKnowledgeBaseEntries(collectionId?: string | null, organizationId?: string | null) {
    const supabase = await createClient()
    const scopedOrganizationId = await getScopedOrganizationId(supabase, organizationId)
    // Explicitly filtering by org is safer even with RLS, but for read-only RLS is sufficient usually.
    // However, knowing the org context is good. 
    // For now, reliance on RLS for SELECT is standard in Supabase apps unless we need optimization.

    let query = supabase
        .from('knowledge_documents')
        .select(`
            id, organization_id, content, title, type, collection_id, status, created_at, updated_at,
            collection:knowledge_collections(*)
        `)
        .order('created_at', { ascending: false })

    if (scopedOrganizationId) {
        query = query.eq('organization_id', scopedOrganizationId)
    }

    if (collectionId) {
        query = query.eq('collection_id', collectionId)
    } else {
        // If collectionId is specifically null (root), filter for null.
        if (collectionId === null) {
            query = query.is('collection_id', null)
        }
    }

    const { data, error } = await query

    if (error) throw new Error(error.message)

    return (data ?? []).map(item => ({
        ...item,
        collection: Array.isArray(item.collection) ? item.collection[0] : item.collection
    })) as KnowledgeBaseEntry[]
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

    try {
        const embedding = await generateEmbedding(query)
        const { data: result, error } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: formatEmbeddingForPgvector(embedding),
            match_threshold: threshold,
            match_count: limit,
            filter_org_id: organizationId,
            filter_collection_id: options?.collectionId ?? null,
            filter_type: options?.type ?? null,
            filter_language: options?.language ?? null
        })

        if (error) {
            console.error('RAG Search failed:', error)
        } else {
            data = (result ?? null) as KnowledgeSearchResult[] | null
        }
    } catch (error) {
        console.error('Embedding generation failed:', error)
    }

    if (!data || data.length === 0) {
        const fallbackResults = await searchKnowledgeBaseByKeyword(query, organizationId, limit, {
            collectionId: options?.collectionId ?? null,
            type: options?.type ?? null,
            language: options?.language ?? null,
            supabase
        })
        if (fallbackResults.length > 0) {
            return fallbackResults
        }
    }

    if (!data) return []

    return data
}
export interface SidebarCollection extends KnowledgeCollection {
    files: Pick<KnowledgeBaseEntry, 'id' | 'title' | 'type'>[]
    count: number
}

export type SidebarFile = Pick<KnowledgeBaseEntry, 'id' | 'title' | 'type'>

export interface SidebarData {
    collections: SidebarCollection[]
    uncategorized: SidebarFile[]
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

    // 2. Get Files (only needed fields)
    let filesQuery = supabase
        .from('knowledge_documents')
        .select('id, title, type, collection_id')
        .order('title')
    if (scopedOrganizationId) {
        filesQuery = filesQuery.eq('organization_id', scopedOrganizationId)
    }

    const { data: files, error: filesError } = await filesQuery

    if (filesError) throw new Error(filesError.message)

    // 3. Merge data
    const typedCollections = (collections ?? []) as KnowledgeCollection[]
    const typedFiles = (files ?? []) as KnowledgeFileRow[]
    const sidebarData: SidebarCollection[] = listToTree(typedCollections, typedFiles)
    const uncategorized = typedFiles
        .filter(f => !f.collection_id)
        .map((file) => ({
            id: file.id,
            title: file.title,
            type: file.type
        })) as SidebarFile[]

    return {
        collections: sidebarData,
        uncategorized,
        totalCount: typedFiles.length
    } as SidebarData
}

function listToTree(collections: KnowledgeCollection[], files: KnowledgeFileRow[]): SidebarCollection[] {
    return collections.map(col => {
        const colFiles = files.filter(f => f.collection_id === col.id)
        return {
            ...col,
            files: colFiles,
            count: colFiles.length
        }
    })
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
    'nereye',
    'nerede',
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

function extractKeywordTokens(query: string): string[] {
    const normalized = query
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .trim()

    if (!normalized) return []

    const tokens = normalized.split(/\s+/).filter(Boolean)
    const keywords = tokens.filter(token => token.length >= 3 && !KEYWORD_STOPWORDS.has(token))
    const unique = Array.from(new Set(keywords))

    if (unique.length > 0) {
        return unique.slice(0, 5)
    }

    return Array.from(new Set(tokens.filter(token => token.length >= 3))).slice(0, 5)
}

function sanitizeKeyword(keyword: string): string {
    return keyword.replace(/[%_]/g, '')
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
    const keywords = extractKeywordTokens(query)
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
            similarity: 0.2
        }))
}

async function buildAndStoreChunks(
    supabase: SupabaseClientLike,
    organizationId: string,
    documentId: string,
    content: string
) {
    const chunks = chunkText(content)
    if (chunks.length === 0) return

    const embeddings = await generateEmbeddings(chunks.map((chunk) => chunk.content))

    const rows = chunks.map((chunk, index) => ({
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
