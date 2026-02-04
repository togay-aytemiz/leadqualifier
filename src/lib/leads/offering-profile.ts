'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { normalizeServiceName, isNewCandidate } from '@/lib/leads/catalog'

const PROFILE_SYSTEM_PROMPT = `You update a business Offering Profile.
Keep it short, bullet-like, and grounded in provided content.
Return JSON: { summary: string } only.`

export async function proposeOfferingProfileUpdate(options: {
    organizationId: string
    sourceType: 'skill' | 'knowledge'
    sourceId?: string | null
    content: string
    supabase?: any
}) {
    const supabase = options.supabase ?? await createClient()
    const { data: profile } = await supabase
        .from('offering_profiles')
        .select('summary')
        .eq('organization_id', options.organizationId)
        .maybeSingle()

    const currentSummary = profile?.summary ?? ''

    if (!process.env.OPENAI_API_KEY) return

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const userPrompt = `Current profile:\n${currentSummary}\n\nNew content:\n${options.content}`

    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
            { role: 'system', content: PROFILE_SYSTEM_PROMPT },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) return

    let parsed: { summary?: string } = {}
    try {
        parsed = JSON.parse(response)
    } catch {
        return
    }

    const proposedSummary = (parsed.summary ?? '').trim()
    if (!proposedSummary || proposedSummary === currentSummary.trim()) return

    await supabase.from('offering_profile_updates').insert({
        organization_id: options.organizationId,
        source_type: options.sourceType,
        source_id: options.sourceId ?? null,
        proposed_summary: proposedSummary,
        status: 'pending'
    })

    if (completion.usage) {
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: completion.usage.prompt_tokens ?? 0,
            outputTokens: completion.usage.completion_tokens ?? 0,
            totalTokens: completion.usage.total_tokens ?? 0,
            metadata: { source: 'offering_profile' },
            supabase
        })
    } else {
        await recordAiUsage({
            organizationId: options.organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: estimateTokenCount(PROFILE_SYSTEM_PROMPT) + estimateTokenCount(userPrompt),
            outputTokens: estimateTokenCount(response),
            totalTokens: estimateTokenCount(PROFILE_SYSTEM_PROMPT) + estimateTokenCount(userPrompt) + estimateTokenCount(response),
            metadata: { source: 'offering_profile' },
            supabase
        })
    }
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
