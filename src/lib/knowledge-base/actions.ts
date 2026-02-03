'use server'

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding, generateEmbeddings, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import { chunkText } from '@/lib/knowledge-base/chunking'
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

/**
 * --- COLLECTIONS ---
 */

/**
 * --- HELPERS ---
 */
async function getUserOrganization(supabase: any) {
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

/**
 * --- COLLECTIONS ---
 */

export async function getCollections() {
    const supabase = await createClient()

    // Get collections
    const { data: collections, error } = await supabase
        .from('knowledge_collections')
        .select('*')
        .order('name')

    if (error) throw new Error(error.message)

    // Get counts for each collection
    // This could be optimized with a join/count query but for now this is simple and robust with RLS
    const { data: counts, error: countError } = await supabase
        .from('knowledge_documents')
        .select('collection_id')

    if (countError) throw new Error(countError.message)

    // Map counts
    const countMap = new Map<string, number>()
    counts.forEach((item: any) => {
        if (item.collection_id) {
            countMap.set(item.collection_id, (countMap.get(item.collection_id) || 0) + 1)
        }
    })

    return collections.map(col => ({
        ...col,
        count: countMap.get(col.id) || 0
    })) as KnowledgeCollection[]
}

export async function createCollection(name: string, description?: string, icon: string = 'folder') {
    const supabase = await createClient()
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

    try {
        await buildAndStoreChunks(supabase, organizationId, data.id, entry.content)
        await supabase.from('knowledge_documents').update({ status: 'ready' }).eq('id', data.id)
    } catch (err) {
        console.error('Failed to build knowledge chunks:', err)
        await supabase.from('knowledge_documents').update({ status: 'error' }).eq('id', data.id)
        throw err
    }

    revalidatePath('/knowledge')
    return { ...data, status: 'ready' } as KnowledgeBaseEntry
}

export async function deleteKnowledgeBaseEntry(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('knowledge_documents').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/knowledge')
}

export async function getKnowledgeBaseEntry(id: string) {
    const supabase = await createClient()
    const { data, error } = await supabase
        .from('knowledge_documents')
        .select(`
            id, organization_id, content, title, type, collection_id, status, created_at, updated_at,
            collection:knowledge_collections(*)
        `)
        .eq('id', id)
        .single()

    if (error) throw new Error(error.message)

    return {
        ...data,
        collection: Array.isArray(data.collection) ? data.collection[0] : data.collection
    } as KnowledgeBaseEntry
}

export async function updateKnowledgeBaseEntry(id: string, entry: Partial<KnowledgeBaseInsert>) {
    const supabase = await createClient()

    const contentChanged = typeof entry.content === 'string'

    // If content changed, mark as processing so retrieval skips it
    let updates: any = { ...entry }
    if (contentChanged) {
        updates.status = 'processing'
    }

    const { data, error } = await supabase
        .from('knowledge_documents')
        .update(updates)
        .eq('id', id)
        .select()
        .single()

    if (error || !data) throw new Error(error?.message ?? 'Failed to update knowledge document')

    if (contentChanged) {
        try {
            await supabase.from('knowledge_chunks').delete().eq('document_id', id)
            await buildAndStoreChunks(supabase, data.organization_id, id, entry.content ?? '')
            const { data: readyDoc } = await supabase
                .from('knowledge_documents')
                .update({ status: 'ready' })
                .eq('id', id)
                .select()
                .single()

            revalidatePath('/knowledge')
            return (readyDoc ?? data) as KnowledgeBaseEntry
        } catch (err) {
            await supabase.from('knowledge_documents').update({ status: 'error' }).eq('id', id)
            throw err
        }
    }

    revalidatePath('/knowledge')
    return data as KnowledgeBaseEntry
}

export async function getKnowledgeBaseEntries(collectionId?: string | null) {
    const supabase = await createClient()
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

    return data.map(item => ({
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
        supabase?: any
    }
) {
    const supabase = options?.supabase || await createClient()
    const embedding = await generateEmbedding(query)

    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
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
        return []
    }

    return data as {
        chunk_id: string
        document_id: string
        document_title: string
        document_type: string
        content: string
        similarity: number
    }[]
}
export interface SidebarCollection extends KnowledgeCollection {
    files: Pick<KnowledgeBaseEntry, 'id' | 'title' | 'type'>[]
    count: number
}

export async function getSidebarData() {
    const supabase = await createClient()

    // 1. Get Collections
    const { data: collections, error: colsError } = await supabase
        .from('knowledge_collections')
        .select('*')
        .order('name')

    if (colsError) throw new Error(colsError.message)

    // 2. Get Files (only needed fields)
    const { data: files, error: filesError } = await supabase
        .from('knowledge_documents')
        .select('id, title, type, collection_id')
        .order('title')

    if (filesError) throw new Error(filesError.message)

    // 3. Merge data
    const sidebarData: SidebarCollection[] = listToTree(collections, files)
    return sidebarData
}

function listToTree(collections: any[], files: any[]): SidebarCollection[] {
    return collections.map(col => {
        const colFiles = files.filter(f => f.collection_id === col.id)
        return {
            ...col,
            files: colFiles,
            count: colFiles.length
        }
    })
}

async function buildAndStoreChunks(
    supabase: any,
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
