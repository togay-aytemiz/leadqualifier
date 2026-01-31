'use server'

import { createClient } from '@/lib/supabase/server'
import { generateEmbeddings, formatEmbeddingForPgvector } from './embeddings'
import type { Skill, SkillInsert, SkillUpdate, SkillMatch } from '@/types/database'

/**
 * Get all skills for an organization
 */
export async function getSkills(organizationId: string, search?: string): Promise<Skill[]> {
    const supabase = await createClient()

    console.log(`getSkills called for org ${organizationId} with search: "${search}"`)

    let query = supabase
        .from('skills')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

    if (search && search.trim()) {
        const term = search.trim()
        const searchTerm = `%${term}%`
        // Search title, response_text, AND trigger_examples (by casting array to text)
        // Note: casting array to text yields format like ["a","b"], so ilike works for partial matches
        query = query.or(`title.ilike.${searchTerm},response_text.ilike.${searchTerm},trigger_examples.cs.{${term}}`)
    }

    const { data, error } = await query
    console.log(`getSkills found ${data?.length} results`)

    if (error) {
        console.error('getSkills error:', error)
        throw new Error(error.message)
    }
    return data ?? []
}

/**
 * Get a single skill by ID
 */
export async function getSkill(skillId: string): Promise<Skill | null> {
    const supabase = await createClient()

    const { data, error } = await supabase.from('skills').select('*').eq('id', skillId).single()

    if (error) {
        if (error.code === 'PGRST116') return null
        throw new Error(error.message)
    }
    return data
}

/**
 * Create a new skill and generate embeddings for trigger examples
 */
export async function createSkill(skill: SkillInsert): Promise<Skill> {
    const supabase = await createClient()

    // Create the skill
    const { data, error } = await supabase.from('skills').insert(skill).select().single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Failed to create skill')

    // Generate and store embeddings for trigger examples
    await generateAndStoreEmbeddings(data.id, skill.trigger_examples)

    return data
}

/**
 * Update a skill and regenerate embeddings if triggers changed
 */
export async function updateSkill(
    skillId: string,
    updates: SkillUpdate,
    currentTriggers?: string[]
): Promise<Skill> {
    const supabase = await createClient()

    const { data, error } = await supabase.from('skills').update(updates).eq('id', skillId).select().single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Failed to update skill')

    // If triggers were updated, regenerate embeddings
    if (updates.trigger_examples && updates.trigger_examples !== currentTriggers) {
        // Delete old embeddings
        await supabase.from('skill_embeddings').delete().eq('skill_id', skillId)

        // Generate new embeddings
        await generateAndStoreEmbeddings(skillId, updates.trigger_examples)
    }

    return data
}

/**
 * Delete a skill (embeddings cascade automatically)
 */
export async function deleteSkill(skillId: string): Promise<void> {
    const supabase = await createClient()

    const { error } = await supabase.from('skills').delete().eq('id', skillId)

    if (error) throw new Error(error.message)
}

/**
 * Toggle skill enabled/disabled
 */
export async function toggleSkill(skillId: string, enabled: boolean): Promise<Skill> {
    return updateSkill(skillId, { enabled })
}

/**
 * Generate embeddings for trigger examples and store in database
 */
async function generateAndStoreEmbeddings(skillId: string, triggerExamples: string[]): Promise<void> {
    if (triggerExamples.length === 0) return

    const supabase = await createClient()

    // Generate embeddings for all triggers
    const embeddings = await generateEmbeddings(triggerExamples)

    // Prepare rows for insertion
    const rows = triggerExamples.map((trigger, i) => ({
        skill_id: skillId,
        trigger_text: trigger,
        embedding: formatEmbeddingForPgvector(embeddings[i] ?? []),
    }))

    // Insert embeddings
    const { error } = await supabase.from('skill_embeddings').insert(rows)

    if (error) {
        console.error('Failed to store embeddings:', error)
        throw new Error(`Failed to store embeddings: ${error.message}`)
    }
}

/**
 * Match user message to skills using semantic similarity
 */
export async function matchSkills(
    query: string,
    organizationId: string,
    threshold: number = 0.5,
    limit: number = 5
): Promise<SkillMatch[]> {
    const supabase = await createClient()

    // Generate embedding for the query
    const [queryEmbedding] = await generateEmbeddings([query])
    if (!queryEmbedding) return []

    // Call the match_skills function
    const { data, error } = await supabase.rpc('match_skills', {
        query_embedding: formatEmbeddingForPgvector(queryEmbedding),
        org_id: organizationId,
        match_threshold: threshold,
        match_count: limit,
    })

    if (error) {
        console.error('Failed to match skills:', error)
        return []
    }

    return data ?? []
}
