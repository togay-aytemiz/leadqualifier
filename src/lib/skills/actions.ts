'use server'

import { createClient } from '@/lib/supabase/server'
import { generateEmbeddings, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import type { Skill, SkillInsert, SkillUpdate, SkillMatch } from '@/types/database'
import { buildDefaultSystemSkills } from '@/lib/skills/default-system-skills'
import { buildSkillEmbeddingTexts } from '@/lib/skills/embeddings'
import { shouldRunSkillsMaintenanceForOrganization } from '@/lib/skills/maintenance-cache'
import { assertTenantWriteAllowed } from '@/lib/organizations/active-context'
import {
    appendServiceCatalogCandidates,
    appendOfferingProfileSuggestion,
    appendRequiredIntakeFields
} from '@/lib/leads/offering-profile'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

/**
 * Get all skills for an organization
 */
export async function getSkills(organizationId: string, search?: string, locale?: string): Promise<Skill[]> {
    const supabase = await createClient()

    if (!search?.trim()) {
        await ensureDefaultSystemSkills(supabase, organizationId, locale)
        if (shouldRunSkillsMaintenanceForOrganization(organizationId)) {
            await ensureSkillEmbeddingsForOrg(supabase, organizationId)
        }
    }

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
    await assertTenantWriteAllowed(supabase)

    // Create the skill
    const { data, error } = await supabase.from('skills').insert(skill).select().single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Failed to create skill')

    // Generate and store embeddings for trigger examples
    await generateAndStoreEmbeddings(
        data.id,
        data.organization_id,
        data.title,
        skill.trigger_examples
    )

    const profileContent = `${data.title}\n${skill.trigger_examples.join('\n')}\n${data.response_text}`

    try {
        await appendServiceCatalogCandidates({
            organizationId: data.organization_id,
            sourceType: 'skill',
            sourceId: data.id,
            content: profileContent,
            supabase
        })
    } catch (error) {
        console.error('Failed to propose skill-based services:', error)
    }

    try {
        await appendOfferingProfileSuggestion({
            organizationId: data.organization_id,
            sourceType: 'skill',
            sourceId: data.id,
            content: profileContent,
            supabase
        })
    } catch (error) {
        console.error('Failed to propose skill-based offering profile suggestion:', error)
    }

    try {
        await appendRequiredIntakeFields({
            organizationId: data.organization_id,
            sourceType: 'skill',
            content: profileContent,
            supabase
        })
    } catch (error) {
        console.error('Failed to propose skill-based required intake fields:', error)
    }

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
    await assertTenantWriteAllowed(supabase)

    const { data, error } = await supabase.from('skills').update(updates).eq('id', skillId).select().single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Failed to update skill')

    // Regenerate embeddings when title or triggers change.
    if (updates.trigger_examples || updates.title) {
        // Delete old embeddings
        await supabase.from('skill_embeddings').delete().eq('skill_id', skillId)

        // Generate new embeddings
        const nextTitle = updates.title ?? data.title
        const nextTriggers = updates.trigger_examples ?? currentTriggers ?? data.trigger_examples
        await generateAndStoreEmbeddings(
            skillId,
            data.organization_id,
            nextTitle,
            nextTriggers
        )
    }

    const shouldPropose = Boolean(updates.title || updates.response_text || updates.trigger_examples)
    if (shouldPropose) {
        const profileContent = `${data.title}\n${(updates.trigger_examples ?? currentTriggers ?? []).join('\n')}\n${data.response_text}`

        try {
            await appendServiceCatalogCandidates({
                organizationId: data.organization_id,
                sourceType: 'skill',
                sourceId: data.id,
                content: profileContent,
                supabase
            })
        } catch (error) {
            console.error('Failed to propose skill-based services:', error)
        }

        try {
            await appendOfferingProfileSuggestion({
                organizationId: data.organization_id,
                sourceType: 'skill',
                sourceId: data.id,
                content: profileContent,
                supabase
            })
        } catch (error) {
            console.error('Failed to propose skill-based offering profile suggestion:', error)
        }

        try {
            await appendRequiredIntakeFields({
                organizationId: data.organization_id,
                sourceType: 'skill',
                content: profileContent,
                supabase
            })
        } catch (error) {
            console.error('Failed to propose skill-based required intake fields:', error)
        }
    }

    return data
}

/**
 * Delete a skill (embeddings cascade automatically)
 */
export async function deleteSkill(skillId: string): Promise<void> {
    const supabase = await createClient()
    await assertTenantWriteAllowed(supabase)

    const { error } = await supabase.from('skills').delete().eq('id', skillId)

    if (error) throw new Error(error.message)
}

/**
 * Toggle skill enabled/disabled
 */
export async function toggleSkill(skillId: string, enabled: boolean): Promise<Skill> {
    return updateSkill(skillId, { enabled })
}

type SkillsClient = Awaited<ReturnType<typeof createClient>>

async function ensureDefaultSystemSkills(
    supabase: SkillsClient,
    organizationId: string,
    locale?: string
): Promise<void> {
    const { count, error: countError } = await supabase
        .from('skills')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)

    if (countError) {
        console.error('Failed to check skill count for default seeding:', countError)
        return
    }

    if ((count ?? 0) > 0) return

    const defaultSkills = buildDefaultSystemSkills(organizationId, locale)
    const { data, error: insertError } = await supabase
        .from('skills')
        .insert(defaultSkills)
        .select('id, organization_id, title, trigger_examples')

    if (insertError) {
        console.error('Failed to seed default system skills:', insertError)
        return
    }

    await Promise.all(
        (data ?? []).map((skill) =>
            generateAndStoreEmbeddings(
                skill.id,
                skill.organization_id,
                skill.title,
                skill.trigger_examples ?? []
            )
        )
    )
}

async function ensureSkillEmbeddingsForOrg(
    supabase: SkillsClient,
    organizationId: string
): Promise<void> {
    const { data: skills, error: skillsError } = await supabase
        .from('skills')
        .select('id, organization_id, title, trigger_examples')
        .eq('organization_id', organizationId)

    if (skillsError) {
        console.error('Failed to load skills for embedding backfill:', skillsError)
        return
    }

    const rows = skills ?? []
    if (rows.length === 0) return

    const skillIds = rows.map((skill) => skill.id)

    const { data: embeddings, error: embeddingsError } = await supabase
        .from('skill_embeddings')
        .select('skill_id')
        .in('skill_id', skillIds)

    if (embeddingsError) {
        console.error('Failed to load skill embeddings for backfill:', embeddingsError)
        return
    }

    const counts = new Map<string, number>()
    for (const row of embeddings ?? []) {
        counts.set(row.skill_id, (counts.get(row.skill_id) ?? 0) + 1)
    }

    const missing = rows.filter((skill) => {
        const expectedCount = buildSkillEmbeddingTexts(skill.title, skill.trigger_examples ?? []).length
        const embeddingCount = counts.get(skill.id) ?? 0
        return expectedCount > 0 && embeddingCount !== expectedCount
    })

    for (const skill of missing) {
        const { error } = await supabase.from('skill_embeddings').delete().eq('skill_id', skill.id)
        if (error) {
            console.error('Failed to clear stale skill embeddings before backfill:', error)
            continue
        }
        await generateAndStoreEmbeddings(
            skill.id,
            skill.organization_id,
            skill.title,
            skill.trigger_examples ?? []
        )
    }
}

/**
 * Generate embeddings for trigger examples and store in database
 */
async function generateAndStoreEmbeddings(
    skillId: string,
    organizationId: string,
    title: string,
    triggerExamples: string[]
): Promise<void> {
    const embeddingTexts = buildSkillEmbeddingTexts(title, triggerExamples)
    if (embeddingTexts.length === 0) return

    const supabase = await createClient()

    // Generate embeddings for title + trigger texts.
    const embeddings = await generateEmbeddings(embeddingTexts, {
        organizationId,
        supabase,
        usageMetadata: {
            source: 'skill_index_embedding',
            skill_id: skillId
        }
    })

    // Prepare rows for insertion
    const rows = embeddingTexts.map((trigger, i) => ({
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
    limit: number = 5,
    customSupabase?: SupabaseClientLike
): Promise<SkillMatch[]> {
    const supabase = customSupabase || await createClient()

    // Generate embedding for the query
    const [queryEmbedding] = await generateEmbeddings([query], {
        organizationId,
        supabase,
        usageMetadata: {
            source: 'skill_query_embedding'
        }
    })
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
