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

    const countMap = new Map<string, number>()
    const { data: aggregatedCounts, error: aggregatedCountError } = await supabase.rpc(
        'count_knowledge_documents_by_collection',
        {
            target_organization_id: scopedOrganizationId ?? null
        }
    )

    if (aggregatedCountError) {
        console.warn('Falling back to document row scan for knowledge collection counts:', aggregatedCountError)

        let countsQuery = supabase
            .from('knowledge_documents')
            .select('collection_id')
        if (scopedOrganizationId) {
            countsQuery = countsQuery.eq('organization_id', scopedOrganizationId)
        }

        const { data: counts, error: countError } = await countsQuery

        if (countError) throw new Error(countError.message)

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
    const vectorLimit = Math.max(limit, Math.min(12, limit * 2))

    try {
        const embedding = await generateEmbedding(query, {
            organizationId,
            supabase,
            usageMetadata: {
                source: 'knowledge_search_query_embedding'
            }
        })
        const { data: result, error } = await supabase.rpc('match_knowledge_chunks', {
            query_embedding: formatEmbeddingForPgvector(embedding),
            match_threshold: threshold,
            match_count: vectorLimit,
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

    const fallbackResults = await searchKnowledgeBaseByKeyword(query, organizationId, Math.max(limit * 8, 40), {
        collectionId: options?.collectionId ?? null,
        type: options?.type ?? null,
        language: options?.language ?? null,
        supabase
    })

    if ((!data || data.length === 0) && fallbackResults.length > 0) {
        return mergeSearchResults(query, [], fallbackResults, limit)
    }

    if (!data) return []

    return mergeSearchResults(query, data, fallbackResults, limit)
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
    'kimlerden',
    'nereye',
    'nerede',
    'nereden',
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

function lexicalMatchScore(query: string, value: string) {
    const groups = keywordGroups(query)
    if (groups.length === 0) return 0

    const haystack = normalizeSearchText(value)
    const hits = groups.filter((group) => {
        return group.some((keyword) => haystack.includes(normalizeSearchText(keyword)))
    }).length

    return hits / groups.length
}

function extractSourceUrlFromContent(content: string) {
    return content.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim() ?? ''
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
    let score = 0

    if (isEvergreenPath(pathname)) {
        score += timeSensitive ? 0.02 : 0.1
    }

    if (isTransientPath(pathname) && !timeSensitive) {
        score -= 0.14
    }

    return score
}

function directIntentScore(query: string, sourceUrl: string, result: KnowledgeSearchResult) {
    const pathname = normalizeSearchText(sourcePath(sourceUrl))
    const searchable = normalizeSearchText(`${result.document_title}\n${result.content}\n${sourceUrl}`)
    let score = 0
    const hasSpecificContactSubject = hasQuerySignal(query, [
        'koordinatorluk',
        'koordinatörlük',
        'koordinatorlugu',
        'koordinatörlüğü',
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

    if (hasQuerySignal(query, ['iletisim', 'iletişim', 'ulasim', 'ulaşım', 'adres', 'telefon'])
        && (pathname.includes('iletisim') || pathname.includes('ulasim'))
        && (!hasSpecificContactSubject || lexicalMatchScore(query, `${result.document_title}\n${sourceUrl}`) >= 0.5)) {
        score += 0.18
    }

    if (hasQuerySignal(query, ['aday ogrenci', 'aday öğrenci'])
        && pathname === '/aday-ogrenci') {
        score += 0.22
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

    return score
}

function scoreKnowledgeResult(query: string, result: KnowledgeSearchResult) {
    const similarity = Number.isFinite(result.similarity) ? Number(result.similarity) : 0
    const sourceUrl = extractSourceUrlFromContent(result.content)
    const contentScore = lexicalMatchScore(query, `${result.document_title}\n${result.content}`)
    const titleScore = lexicalMatchScore(query, result.document_title ?? '')
    const sourceUrlScore = lexicalMatchScore(query, sourceUrl)

    return similarity * 0.6
        + contentScore * 0.4
        + titleScore * 0.15
        + sourceUrlScore * 0.18
        + pageTypeScore(query, sourceUrl)
        + directIntentScore(query, sourceUrl, result)
}

function mergeSearchResults(
    query: string,
    vectorResults: KnowledgeSearchResult[],
    keywordResults: KnowledgeSearchResult[],
    limit: number
) {
    const byChunk = new Map<string, KnowledgeSearchResult>()

    for (const result of [...vectorResults, ...keywordResults]) {
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

function chunkContentHasMetadata(content: string) {
    return /^Page Title:\s+/im.test(content) || /^Document Title:\s+/im.test(content)
}

function buildIndexedChunkContent(title: string, content: string) {
    const normalizedTitle = title.trim()
    const normalizedContent = content.trim()
    if (!normalizedTitle || chunkContentHasMetadata(normalizedContent)) return normalizedContent

    return `Document Title: ${normalizedTitle}\n\n${normalizedContent}`
}

async function buildAndStoreChunks(
    supabase: SupabaseClientLike,
    organizationId: string,
    documentId: string,
    title: string,
    content: string
) {
    const chunks = chunkText(content)
    if (chunks.length === 0) return
    const indexedChunks = chunks.map((chunk) => {
        const indexedContent = buildIndexedChunkContent(title, chunk.content)
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
