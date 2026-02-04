'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'

const SUGGESTION_SYSTEM_PROMPT = `You generate AI suggestions for a business offering profile.
Keep it short, clear, and grounded in the provided content.
Return JSON: { suggestion: string } only.`

function parseSuggestion(raw: string) {
    try {
        const parsed = JSON.parse(raw)
        const suggestion = (parsed.suggestion ?? '').toString().trim()
        return suggestion || null
    } catch {
        return null
    }
}

async function createSuggestion(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge' | 'batch'
    sourceId?: string | null
    content: string
    supabase?: any
}) {
    const supabase = options.supabase ?? await createClient()
    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('ai_suggestions_enabled')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    if (!profile?.ai_suggestions_enabled) return null

    if (!process.env.OPENAI_API_KEY) return null

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const userPrompt = `New content:\n${options.content}`

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
            { role: 'system', content: SUGGESTION_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) return null

    const suggestion = parseSuggestion(response)
    if (!suggestion) return null

    await supabase.from('offering_profile_suggestions').insert({
        organization_id: options.organizationId,
        source_type: options.sourceType,
        source_id: options.sourceId ?? null,
        content: suggestion
    })

    if (completion.usage) {
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: completion.usage.prompt_tokens ?? 0,
            outputTokens: completion.usage.completion_tokens ?? 0,
            totalTokens: completion.usage.total_tokens ?? 0,
            metadata: { source: 'offering_profile_suggestion', source_type: options.sourceType },
            supabase
        })
    } else {
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: estimateTokenCount(SUGGESTION_SYSTEM_PROMPT) + estimateTokenCount(userPrompt),
            outputTokens: estimateTokenCount(response),
            totalTokens: estimateTokenCount(SUGGESTION_SYSTEM_PROMPT) + estimateTokenCount(userPrompt) + estimateTokenCount(response),
            metadata: { source: 'offering_profile_suggestion', source_type: options.sourceType },
            supabase
        })
    }

    return suggestion
}

export async function appendOfferingProfileSuggestion(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge'
    sourceId?: string | null
    content: string
    supabase?: any
}) {
    return createSuggestion({
        organizationId: options.organizationId,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        content: options.content,
        supabase: options.supabase
    })
}

export async function generateInitialOfferingSuggestion(options: {
    organizationId: string
    supabase?: any
}) {
    const supabase = options.supabase ?? await createClient()
    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('ai_suggestions_enabled')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    if (!profile?.ai_suggestions_enabled) return null

    const { data: existing } = await supabase
        .from('offering_profile_suggestions')
        .select('id')
        .eq('organization_id', options.organizationId)
        .limit(1)

    if (existing && existing.length > 0) return null

    const [skillsResult, docsResult] = await Promise.all([
        supabase
            .from('skills')
            .select('title, trigger_examples, response_text')
            .eq('organization_id', options.organizationId)
            .eq('enabled', true)
            .order('updated_at', { ascending: false })
            .limit(20),
        supabase
            .from('knowledge_documents')
            .select('title, content, status')
            .eq('organization_id', options.organizationId)
            .eq('status', 'ready')
            .order('updated_at', { ascending: false })
            .limit(20)
    ])

    const skills = skillsResult.data ?? []
    const docs = docsResult.data ?? []

    if (skills.length === 0 && docs.length === 0) return null

    const skillLines = skills.map((skill: any) => `- ${skill.title}`).join('\n')
    const docLines = docs.map((doc: any) => `- ${doc.title}`).join('\n')

    const content = `Skills:\n${skillLines}\n\nKnowledge Base:\n${docLines}`

    return createSuggestion({
        organizationId: options.organizationId,
        sourceType: 'batch',
        content,
        supabase
    })
}

export async function proposeServiceCandidate(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge'
    sourceId?: string | null
    name: string
    supabase?: any
}) {
    const supabase = options.supabase ?? await createClient()
    const normalized = normalizeServiceName(options.name)
    if (!normalized) return

    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('catalog_enabled')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    if (profile && profile.catalog_enabled === false) return

    const { data: existingCatalog } = await supabase
        .from('service_catalog')
        .select('name')
        .eq('organization_id', options.organizationId)

    const { data: existingCandidates } = await supabase
        .from('service_candidates')
        .select('proposed_name')
        .eq('organization_id', options.organizationId)
        .eq('status', 'pending')

    const existing = [
        ...(existingCatalog ?? []).map((row: any) => row.name),
        ...(existingCandidates ?? []).map((row: any) => row.proposed_name)
    ]

    if (!isNewCandidate(options.name, existing)) return

    await supabase.from('service_candidates').insert({
        organization_id: options.organizationId,
        source_type: options.sourceType,
        source_id: options.sourceId ?? null,
        proposed_name: options.name,
        status: 'pending'
    })
}
