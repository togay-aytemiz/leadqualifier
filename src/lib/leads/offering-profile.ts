'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'
import {
    filterMissingIntakeFields,
    mergeIntakeFields,
    normalizeIntakeFields,
    parseRequiredIntakeFieldsPayload,
    parseSuggestionPayload
} from '@/lib/leads/offering-profile-utils'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const DEFAULT_SUGGESTION_LOCALE = 'tr'

const SUGGESTION_LANGUAGE_BY_LOCALE: Record<string, string> = {
    tr: 'Turkish',
    en: 'English'
}

const buildSuggestionSystemPrompt = (language: string, labels: string) => `You generate a service offering profile suggestion for a business.
Only use the provided content. Do not give business advice.
Use the offering profile summary plus approved/rejected suggestions as context.
Treat approved suggestions as confirmed scope.
Avoid repeating rejected suggestions unless new content explicitly changes the scope.
Write the suggestion in ${language}.
Format:
- One short intro sentence.
- 3 to 5 bullet points total. Each bullet starts with a category label and a colon.
- Include concrete constraints (e.g., time window, eligibility limits, not-offered items) when present.
Use labels in the same language. Allowed labels: ${labels}.
If existing approved suggestions are provided and new content conflicts or overlaps, set update_index to the 1-based item to update.
Otherwise, set update_index to null.
Return JSON: { suggestion: string, update_index: number | null } only.`

const resolveSuggestionLanguage = (locale?: string | null) => {
    const key = locale ?? DEFAULT_SUGGESTION_LOCALE
    return SUGGESTION_LANGUAGE_BY_LOCALE[key] ?? SUGGESTION_LANGUAGE_BY_LOCALE[DEFAULT_SUGGESTION_LOCALE] ?? 'Turkish'
}

const SUGGESTION_LABELS_BY_LOCALE: Record<string, string[]> = {
    tr: ['Sunulanlar', 'Sunulmayanlar', 'Koşullar'],
    en: ['Offered', 'Not offered', 'Conditions']
}

const resolveSuggestionLabels = (locale?: string | null) => {
    const key = locale ?? DEFAULT_SUGGESTION_LOCALE
    return SUGGESTION_LABELS_BY_LOCALE[key] ?? SUGGESTION_LABELS_BY_LOCALE[DEFAULT_SUGGESTION_LOCALE] ?? ['Offered', 'Not offered', 'Conditions']
}

const hasValidHybridFormat = (text: string, labels: string[]) => {
    const lines = text.split('\n').map(line => line.trim()).filter(Boolean)
    if (lines.length < 3) return false
    const bulletLines = lines.filter(line => line.startsWith('- '))
    if (bulletLines.length < 3) return false
    const labelPattern = new RegExp(`^-\\s*(${labels.map(label => label.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')).join('|')})\\s*:`, 'i')
    const labeledBullets = bulletLines.filter(line => labelPattern.test(line))
    return labeledBullets.length >= 2
}

const buildRepairSystemPrompt = (language: string, labels: string) => `Rewrite the draft into the required service offering profile format.
Write in ${language}. Keep the same meaning but add missing details from the provided content.
Format:
- One short intro sentence.
- 3 to 5 bullet points total. Each bullet starts with a category label and a colon.
Use labels in the same language. Allowed labels: ${labels}.
Return JSON: { suggestion: string, update_index: number | null } only.`

const buildRequiredIntakeFieldsPrompt = (language: string) => `You propose missing intake fields for lead qualification.
Write field names in ${language}.
Use only information from the provided content and profile context.
Do not repeat existing fields.
Keep each field short (1 to 4 words), customer-facing, and specific.
Avoid generic fields like "other details".
Return ONLY JSON in this format: { "required_fields": string[] }`

async function recordSuggestionUsage(options: {
    organizationId: string
    supabase: SupabaseClientLike
    systemPrompt: string
    userPrompt: string
    response: string
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
    sourceType: 'skill' | 'knowledge' | 'batch'
}) {
    const { organizationId, supabase, systemPrompt, userPrompt, response, usage, sourceType } = options
    if (usage) {
        await recordAiUsage({
            organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            metadata: { source: 'offering_profile_suggestion', source_type: sourceType },
            supabase
        })
    } else {
        const promptTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt)
        const outputTokens = estimateTokenCount(response)
        await recordAiUsage({
            organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: promptTokens,
            outputTokens,
            totalTokens: promptTokens + outputTokens,
            metadata: { source: 'offering_profile_suggestion', source_type: sourceType },
            supabase
        })
    }
}

async function recordRequiredFieldsUsage(options: {
    organizationId: string
    supabase: SupabaseClientLike
    systemPrompt: string
    userPrompt: string
    response: string
    usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null
    sourceType: 'skill' | 'knowledge'
}) {
    const { organizationId, supabase, systemPrompt, userPrompt, response, usage, sourceType } = options
    if (usage) {
        await recordAiUsage({
            organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            metadata: { source: 'required_intake_fields', source_type: sourceType },
            supabase
        })
    } else {
        const promptTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt)
        const outputTokens = estimateTokenCount(response)
        await recordAiUsage({
            organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: promptTokens,
            outputTokens,
            totalTokens: promptTokens + outputTokens,
            metadata: { source: 'required_intake_fields', source_type: sourceType },
            supabase
        })
    }
}

async function createSuggestion(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge' | 'batch'
    sourceId?: string | null
    content: string
    supabase?: SupabaseClientLike
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
    const labels = resolveSuggestionLabels(locale)
    const labelsText = labels.join(', ')
    const systemPrompt = buildSuggestionSystemPrompt(language, labelsText)

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const { data: approvedSuggestions } = await supabase
        .from('offering_profile_suggestions')
        .select('id, content')
        .eq('organization_id', options.organizationId)
        .eq('status', 'approved')
        .eq('locale', locale)
        .is('archived_at', null)
        .is('update_of', null)
        .order('created_at', { ascending: false })
        .limit(5)

    const { data: rejectedSuggestions } = await supabase
        .from('offering_profile_suggestions')
        .select('content')
        .eq('organization_id', options.organizationId)
        .eq('status', 'rejected')
        .eq('locale', locale)
        .is('archived_at', null)
        .is('update_of', null)
        .order('created_at', { ascending: false })
        .limit(5)

    const approvedList = (approvedSuggestions ?? [])
        .map((item: { content?: string | null }, index: number) => `${index + 1}. ${item.content}`)
        .join('\n')
    const approvedBlock = approvedList
        ? `Existing approved suggestions (use these indices for update_index):\n${approvedList}`
        : 'Existing approved suggestions: none'
    const rejectedList = (rejectedSuggestions ?? [])
        .map((item: { content?: string | null }) => `- ${item.content}`)
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
        max_tokens: 260,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) return null

    await recordSuggestionUsage({
        organizationId: options.organizationId,
        supabase,
        systemPrompt,
        userPrompt,
        response,
        usage: completion.usage,
        sourceType: options.sourceType
    })

    let parsed = parseSuggestionPayload(response)
    if (!parsed) return null
    if (!hasValidHybridFormat(parsed.suggestion, labels)) {
        const repairSystemPrompt = buildRepairSystemPrompt(language, labelsText)
        const repairUserPrompt = `New content:\n${options.content}\n\n${summaryBlock}\n\n${approvedBlock}\n\n${rejectedBlock}\n\nDraft:\n${parsed.suggestion}`
        const repairCompletion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.2,
            max_tokens: 260,
            messages: [
                { role: 'system', content: repairSystemPrompt },
                { role: 'user', content: repairUserPrompt }
            ]
        })
        const repairResponse = repairCompletion.choices[0]?.message?.content?.trim()
        if (!repairResponse) return null
        await recordSuggestionUsage({
            organizationId: options.organizationId,
            supabase,
            systemPrompt: repairSystemPrompt,
            userPrompt: repairUserPrompt,
            response: repairResponse,
            usage: repairCompletion.usage,
            sourceType: options.sourceType
        })
        const repaired = parseSuggestionPayload(repairResponse)
        if (!repaired || !hasValidHybridFormat(repaired.suggestion, labels)) return null
        parsed = repaired
    }
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

    return parsed.suggestion
}

export async function appendOfferingProfileSuggestion(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge'
    sourceId?: string | null
    content: string
    supabase?: SupabaseClientLike
}) {
    return createSuggestion({
        organizationId: options.organizationId,
        sourceType: options.sourceType,
        sourceId: options.sourceId,
        content: options.content,
        supabase: options.supabase
    })
}

export async function appendRequiredIntakeFields(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge'
    content: string
    supabase?: SupabaseClientLike
}) {
    const supabase = options.supabase ?? await createClient()

    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('*')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    if (!profile) return []
    if (profile.required_intake_fields_ai_enabled === false) return []
    if (!process.env.OPENAI_API_KEY) return []

    const existingFields = normalizeIntakeFields(profile.required_intake_fields ?? [])
    const existingAiFields = normalizeIntakeFields(profile.required_intake_fields_ai ?? [])
    const locale = profile.ai_suggestions_locale ?? DEFAULT_SUGGESTION_LOCALE
    const language = resolveSuggestionLanguage(locale)
    const systemPrompt = buildRequiredIntakeFieldsPrompt(language)
    const existingBlock = existingFields.length > 0
        ? existingFields.map((field) => `- ${field}`).join('\n')
        : 'none'
    const profileContext = [
        (profile.summary ?? '').trim(),
        (profile.manual_profile_note ?? '').trim()
    ].filter(Boolean).join('\n\n')
    const profileContextBlock = profileContext || 'none'

    const userPrompt = `New content:\n${options.content}\n\nExisting required intake fields:\n${existingBlock}\n\nOffering profile context:\n${profileContextBlock}`

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        max_tokens: 180,
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) return []

    await recordRequiredFieldsUsage({
        organizationId: options.organizationId,
        supabase,
        systemPrompt,
        userPrompt,
        response,
        usage: completion.usage,
        sourceType: options.sourceType
    })

    const parsedFields = parseRequiredIntakeFieldsPayload(response)
    if (!parsedFields || parsedFields.length === 0) return []

    const missingFields = filterMissingIntakeFields(existingFields, parsedFields)
    if (missingFields.length === 0) return []

    const nextRequiredFields = mergeIntakeFields(existingFields, missingFields)
    const nextAiFields = normalizeIntakeFields(
        mergeIntakeFields(existingAiFields, missingFields)
            .filter((field) => filterMissingIntakeFields(nextRequiredFields, [field]).length === 0)
    )

    let { error } = await supabase
        .from('offering_profiles')
        .update({
            required_intake_fields: nextRequiredFields,
            required_intake_fields_ai: nextAiFields
        })
        .eq('organization_id', options.organizationId)

    // Backward-compatible fallback for partially migrated databases.
    if (error?.message?.includes('required_intake_fields_ai')) {
        ({ error } = await supabase
            .from('offering_profiles')
            .update({ required_intake_fields: nextRequiredFields })
            .eq('organization_id', options.organizationId))
    }

    if (error) {
        throw new Error(`Failed to update required intake fields: ${error.message}`)
    }

    return missingFields
}

export async function generateInitialOfferingSuggestion(options: {
    organizationId: string
    skipExistingCheck?: boolean
    supabase?: SupabaseClientLike
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
            .is('archived_at', null)
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

    const skillLines = skills.map((skill: { title?: string | null }) => `- ${skill.title}`).join('\n')
    const docLines = docs.map((doc: { title?: string | null }) => `- ${doc.title}`).join('\n')

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
    supabase?: SupabaseClientLike
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
        ...(existingCatalog ?? []).map((row: { name?: string | null }) => row.name ?? ''),
        ...(existingCandidates ?? []).map((row: { proposed_name?: string | null }) => row.proposed_name ?? '')
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
