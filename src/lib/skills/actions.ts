'use server'

import { createClient as createServiceClient } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/server'
import { generateEmbeddings, formatEmbeddingForPgvector } from '@/lib/ai/embeddings'
import type { Skill, SkillInsert, SkillUpdate, SkillMatch } from '@/types/database'
import { buildDefaultSystemSkills } from '@/lib/skills/default-system-skills'
import { buildSkillEmbeddingTexts } from '@/lib/skills/embeddings'
import { sanitizeSkillActions } from '@/lib/skills/skill-actions'
import { assertTenantWriteAllowed, resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import {
    SKILL_IMAGE_BUCKET,
    buildSkillImageStoragePath
} from '@/lib/skills/image'
import {
    appendServiceCatalogCandidates,
    appendOfferingProfileSuggestion,
    appendRequiredIntakeFields
} from '@/lib/leads/offering-profile'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

function requireSupabaseStorageEnv() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

    if (!supabaseUrl || !serviceRoleKey) {
        throw new Error('Missing Supabase storage configuration')
    }

    return { supabaseUrl, serviceRoleKey }
}

function createSkillImageStorageClient() {
    const { supabaseUrl, serviceRoleKey } = requireSupabaseStorageEnv()
    return createServiceClient(supabaseUrl, serviceRoleKey).storage.from(SKILL_IMAGE_BUCKET)
}

function createSkillImageUploadVersion() {
    const timestamp = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
    const uniqueSuffix = typeof globalThis.crypto?.randomUUID === 'function'
        ? globalThis.crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(16).slice(2)}`

    return `${timestamp}-${uniqueSuffix}`
}

async function requireActiveSkillImageOrganizationId(
    supabase: SupabaseClientLike,
    requestedOrganizationId: string
) {
    await assertTenantWriteAllowed(supabase)
    const normalizedRequestedOrganizationId = requestedOrganizationId.trim()
    const activeContext = await resolveActiveOrganizationContext(supabase)
    const activeOrganizationId = activeContext?.activeOrganizationId?.trim() ?? ''

    if (!normalizedRequestedOrganizationId || !activeOrganizationId || normalizedRequestedOrganizationId !== activeOrganizationId) {
        throw new Error('Skill image upload path does not belong to the active organization')
    }

    return activeOrganizationId
}

async function removeStoredSkillImageObject(storagePath: string | null | undefined) {
    const normalizedStoragePath = storagePath?.trim()
    if (!normalizedStoragePath) return

    try {
        const storage = createSkillImageStorageClient()
        const { error } = await storage.remove([normalizedStoragePath])
        if (error) {
            console.warn('Failed to remove stored skill image object:', error)
        }
    } catch (error) {
        console.warn('Failed to initialize skill image storage cleanup:', error)
    }
}

function buildSkillsListQuery(
    supabase: SupabaseClientLike,
    organizationId: string,
    search?: string
) {
    let query = supabase
        .from('skills')
        .select('*')
        .eq('organization_id', organizationId)
        .order('created_at', { ascending: false })

    if (search && search.trim()) {
        const term = search.trim()
        const searchTerm = `%${term}%`
        query = query.or(`title.ilike.${searchTerm},response_text.ilike.${searchTerm},trigger_examples.cs.{${term}}`)
    }

    return query
}

/**
 * Get all skills for an organization
 */
export async function getSkills(organizationId: string, search?: string, locale?: string): Promise<Skill[]> {
    const supabase = await createClient()

    const { data, error } = await buildSkillsListQuery(supabase, organizationId, search)

    if (error) {
        console.error('getSkills error:', error)
        throw new Error(error.message)
    }

    const skills = data ?? []
    if (search?.trim() || skills.length > 0) {
        return skills
    }

    await ensureDefaultSystemSkills(supabase, organizationId, locale)

    const { data: seededData, error: seededError } = await buildSkillsListQuery(supabase, organizationId)

    if (seededError) {
        console.error('getSkills seeded reload error:', seededError)
        throw new Error(seededError.message)
    }

    return seededData ?? []
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
    const sanitizedSkillActions = sanitizeSkillActions(skill.skill_actions ?? [])

    // Create the skill
    const { data, error } = await supabase
        .from('skills')
        .insert({
            ...skill,
            skill_actions: sanitizedSkillActions
        })
        .select()
        .single()

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

export async function prepareSkillImageUpload(organizationId: string) {
    if (!organizationId.trim()) {
        return { ok: false as const, reason: 'validation' as const }
    }

    const supabase = await createClient()
    const activeOrganizationId = await requireActiveSkillImageOrganizationId(supabase, organizationId)

    try {
        const version = createSkillImageUploadVersion()
        const storagePath = buildSkillImageStoragePath({
            organizationId: activeOrganizationId,
            version
        })
        const storage = createSkillImageStorageClient()
        const { data: signedUploadData, error: signedUploadError } = await storage.createSignedUploadUrl(storagePath)

        if (signedUploadError || !signedUploadData?.token) {
            throw signedUploadError ?? new Error('Missing signed upload token')
        }

        const { data: publicUrlData } = storage.getPublicUrl(storagePath)
        const publicUrl = publicUrlData?.publicUrl?.trim() ?? ''
        if (!publicUrl) {
            throw new Error('Could not resolve public URL for skill image upload')
        }

        return {
            ok: true as const,
            bucket: SKILL_IMAGE_BUCKET,
            storagePath,
            uploadToken: signedUploadData.token,
            publicUrl
        }
    } catch (error) {
        console.error('Failed to prepare skill image upload:', error)
        return { ok: false as const, reason: 'request_failed' as const }
    }
}

export async function removeSkillImageUpload(organizationId: string, storagePath: string) {
    const normalizedStoragePath = storagePath.trim()
    if (!organizationId.trim() || !normalizedStoragePath) {
        throw new Error('Skill image upload path does not belong to the active organization')
    }

    const supabase = await createClient()
    const activeOrganizationId = await requireActiveSkillImageOrganizationId(supabase, organizationId)
    if (!normalizedStoragePath.startsWith(`${activeOrganizationId}/`)) {
        throw new Error('Skill image upload path does not belong to the active organization')
    }

    await removeStoredSkillImageObject(normalizedStoragePath)
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
    const { data: existingSkill, error: existingSkillError } = await supabase
        .from('skills')
        .select('id, organization_id, image_storage_path')
        .eq('id', skillId)
        .single()

    if (existingSkillError) throw new Error(existingSkillError.message)

    const updatesWithSanitizedSkillActions = updates.skill_actions
        ? {
            ...updates,
            skill_actions: sanitizeSkillActions(updates.skill_actions)
        }
        : updates

    const { data, error } = await supabase
        .from('skills')
        .update(updatesWithSanitizedSkillActions)
        .eq('id', skillId)
        .select()
        .single()

    if (error) throw new Error(error.message)
    if (!data) throw new Error('Failed to update skill')

    const previousImageStoragePath = existingSkill?.image_storage_path?.trim() ?? ''
    const nextImageStoragePath = data.image_storage_path?.trim() ?? ''
    if (previousImageStoragePath && previousImageStoragePath !== nextImageStoragePath) {
        await removeStoredSkillImageObject(previousImageStoragePath)
    }

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
    const { data: existingSkill, error: existingSkillError } = await supabase
        .from('skills')
        .select('id, image_storage_path')
        .eq('id', skillId)
        .single()

    if (existingSkillError) throw new Error(existingSkillError.message)

    const { error } = await supabase.from('skills').delete().eq('id', skillId)

    if (error) throw new Error(error.message)

    if (existingSkill?.image_storage_path) {
        await removeStoredSkillImageObject(existingSkill.image_storage_path)
    }
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
