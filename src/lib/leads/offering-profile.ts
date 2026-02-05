'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'
import { parseSuggestionPayload } from '@/lib/leads/offering-profile-utils'

const DEFAULT_SUGGESTION_LOCALE = 'tr'

const SUGGESTION_LANGUAGE_BY_LOCALE: Record<string, string> = {
    tr: 'Turkish',
    en: 'English'
}

const buildSuggestionSystemPrompt = (language: string) => `You generate a service offering profile suggestion for a business.
Only use the provided content. Do not give business advice.
Use the offering profile summary plus approved/rejected suggestions as context.
Treat approved suggestions as confirmed scope.
Avoid repeating rejected suggestions unless new content explicitly changes the scope.
Write the suggestion in ${language}.
Format:
- One short intro sentence.
- Up to 5 bullet points total. Each bullet starts with a category label.
Use labels in the same language: "Sunulanlar", "Sunulmayanlar", "Koşullar" (Turkish) or "Offered", "Not offered", "Conditions" (English).
If existing approved suggestions are provided and new content conflicts or overlaps, set update_index to the 1-based item to update.
Otherwise, set update_index to null.
Return JSON: { suggestion: string, update_index: number | null } only.`

const resolveSuggestionLanguage = (locale?: string | null) => {
    const key = locale ?? DEFAULT_SUGGESTION_LOCALE
    return SUGGESTION_LANGUAGE_BY_LOCALE[key] ?? SUGGESTION_LANGUAGE_BY_LOCALE[DEFAULT_SUGGESTION_LOCALE] ?? 'Turkish'
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
        .select('summary, ai_suggestions_enabled, ai_suggestions_locale')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    if (!profile?.ai_suggestions_enabled) return null

    if (!process.env.OPENAI_API_KEY) return null

    const locale = profile?.ai_suggestions_locale ?? DEFAULT_SUGGESTION_LOCALE
    const language = resolveSuggestionLanguage(locale)
    const systemPrompt = buildSuggestionSystemPrompt(language)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { data: approvedSuggestions } = await supabase
        .from('offering_profile_suggestions')
        .select('id, content')
        .eq('organization_id', options.organizationId)
        .eq('status', 'approved')
        .eq('locale', locale)
        .is('update_of', null)
        .order('created_at', { ascending: false })
        .limit(5)

    const { data: rejectedSuggestions } = await supabase
        .from('offering_profile_suggestions')
        .select('content')
        .eq('organization_id', options.organizationId)
        .eq('status', 'rejected')
        .eq('locale', locale)
        .is('update_of', null)
        .order('created_at', { ascending: false })
        .limit(5)

    const approvedList = (approvedSuggestions ?? [])
        .map((item: any, index: number) => `${index + 1}. ${item.content}`)
        .join('\n')
    const approvedBlock = approvedList
        ? `Existing approved suggestions (use these indices for update_index):\n${approvedList}`
        : 'Existing approved suggestions: none'
    const rejectedList = (rejectedSuggestions ?? [])
        .map((item: any) => `- ${item.content}`)
        .join('\n')
    const rejectedBlock = rejectedList
        ? `Rejected suggestions (avoid repeating these unless the new content explicitly changes scope):\n${rejectedList}`
        : 'Rejected suggestions: none'
    const summaryText = (profile?.summary ?? '').trim()
    const summaryBlock = summaryText
        ? `Offering profile summary:\n${summaryText}`
        : 'Offering profile summary: none'
    const userPrompt = `New content:\n${options.content}\n\n${summaryBlock}\n\n${approvedBlock}\n\n${rejectedBlock}`

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) return null

    const parsed = parseSuggestionPayload(response)
    if (!parsed) return null
    const updateTarget = parsed.updateIndex ? approvedSuggestions?.[parsed.updateIndex - 1] : null

    await supabase.from('offering_profile_suggestions').insert({
        organization_id: options.organizationId,
        source_type: options.sourceType,
        source_id: options.sourceId ?? null,
        content: parsed.suggestion,
        status: 'pending',
        locale,
        update_of: updateTarget?.id ?? null
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
        const promptTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt)
        const outputTokens = estimateTokenCount(response)
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: promptTokens,
            outputTokens,
            totalTokens: promptTokens + outputTokens,
            metadata: { source: 'offering_profile_suggestion', source_type: options.sourceType },
            supabase
        })
    }

    return parsed.suggestion
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
    skipExistingCheck?: boolean
    supabase?: any
}) {
    const supabase = options.supabase ?? await createClient()
    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('ai_suggestions_enabled, ai_suggestions_locale')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    if (!profile?.ai_suggestions_enabled) return null

    if (!options.skipExistingCheck) {
        const locale = profile?.ai_suggestions_locale ?? DEFAULT_SUGGESTION_LOCALE
        const { data: existing } = await supabase
            .from('offering_profile_suggestions')
            .select('id')
            .eq('organization_id', options.organizationId)
            .eq('locale', locale)
            .limit(1)

        if (existing && existing.length > 0) return null
    }

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
