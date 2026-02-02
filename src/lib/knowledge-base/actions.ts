'use server'

import { createClient } from '@/lib/supabase/server'
import { generateEmbedding, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import { revalidatePath } from 'next/cache'

export interface KnowledgeCollection {
    id: string
    organization_id: string
    name: string
    description: string | null
    icon: string
    created_at: string
}

export interface KnowledgeBaseEntry {
    id: string
    organization_id: string
    collection_id: string | null
    title: string
    type: 'article' | 'snippet' | 'pdf'
    content: string
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
    const { data, error } = await supabase
        .from('knowledge_collections')
        .select('*')
        .order('name')

    if (error) throw new Error(error.message)
    return data as KnowledgeCollection[]
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

    // 1. Generate embedding
    const embedding = await generateEmbedding(entry.content)

    // 2. Insert into DB
    const { data, error } = await supabase
        .from('knowledge_base')
        .insert({
            content: entry.content,
            title: entry.title,
            type: entry.type,
            collection_id: entry.collection_id,
            embedding: formatEmbeddingForPgvector(embedding),
            organization_id: organizationId
        })
        .select()
        .single()

    if (error) {
        console.error('Failed to create knowledge base entry:', error)
        throw new Error(error.message)
    }

    revalidatePath('/knowledge')
    return data as KnowledgeBaseEntry
}

export async function deleteKnowledgeBaseEntry(id: string) {
    const supabase = await createClient()
    const { error } = await supabase.from('knowledge_base').delete().eq('id', id)
    if (error) throw new Error(error.message)
    revalidatePath('/knowledge')
}

export async function getKnowledgeBaseEntries(collectionId?: string | null) {
    const supabase = await createClient()
    // Explicitly filtering by org is safer even with RLS, but for read-only RLS is sufficient usually.
    // However, knowing the org context is good. 
    // For now, reliance on RLS for SELECT is standard in Supabase apps unless we need optimization.

    let query = supabase
        .from('knowledge_base')
        .select(`
            id, organization_id, content, title, type, collection_id, created_at, updated_at,
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
    limit = 3
) {
    const supabase = await createClient()
    const embedding = await generateEmbedding(query)

    const { data, error } = await supabase.rpc('match_knowledge_base', {
        query_embedding: formatEmbeddingForPgvector(embedding),
        match_threshold: threshold,
        match_count: limit,
        filter_org_id: organizationId
    })

    if (error) {
        console.error('RAG Search failed:', error)
        return []
    }

    return data as { id: string, content: string, similarity: number }[]
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
        .from('knowledge_base')
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

export async function deleteCollection(id: string) {
    const supabase = await createClient()

    // Explicitly delete all knowledge entries in this collection first
    const { error: filesError } = await supabase
        .from('knowledge_base')
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
