import OpenAI from 'openai'
import { recordAiUsage } from '@/lib/ai/usage'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { createClient } from '@/lib/supabase/server'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

const DEFAULT_LOCALE = 'tr'
const DRAFT_LANGUAGE_BY_LOCALE: Record<string, string> = {
    tr: 'Turkish',
    en: 'English'
}

export interface KnowledgeBaseDraftBrief {
    businessBasics: string
    processDetails: string
    botGuidelines: string
    extraNotes: string
}

export interface KnowledgeBaseDraftResult {
    title: string
    content: string
}

function normalizeValue(value: string) {
    return value.trim()
}

function hasAnyBriefContent(brief: KnowledgeBaseDraftBrief) {
    return Object.values(brief).some((value) => normalizeValue(value).length > 0)
}

function resolveDraftLanguage(locale?: string | null) {
    const normalizedLocale = (locale ?? DEFAULT_LOCALE).split('-')[0]?.toLowerCase() ?? DEFAULT_LOCALE
    return DRAFT_LANGUAGE_BY_LOCALE[normalizedLocale] ?? DRAFT_LANGUAGE_BY_LOCALE[DEFAULT_LOCALE] ?? 'Turkish'
}

function buildKnowledgeDraftSystemPrompt(language: string) {
    return `You write a Knowledge Base draft for a business operator.
Use only the facts explicitly provided in the brief.
Do not invent prices, policies, guarantees, addresses, phone numbers, services, schedules, or claims.
Write the output in ${language}.
Write for an internal knowledge base, not for marketing.
Keep it clear, structured, factual, and easy to edit.
Return ONLY JSON in this format: { "title": string, "content": string }.
The title must be short and descriptive.
The content should use short paragraphs and bullet points when useful.`
}

function buildKnowledgeDraftUserPrompt(brief: KnowledgeBaseDraftBrief) {
    const rawSections: Array<[string, string]> = [
        ['Business basics', brief.businessBasics],
        ['Process details', brief.processDetails],
        ['Bot guidelines', brief.botGuidelines],
        ['Extra notes', brief.extraNotes]
    ]

    const sections = rawSections
        .filter(([, value]) => normalizeValue(value).length > 0)
        .map(([label, value]) => `${label}:\n${normalizeValue(value)}`)

    return `Create one knowledge base draft from this operator brief.\n\n${sections.join('\n\n')}`
}

export function parseKnowledgeBaseDraftResponse(response: string): KnowledgeBaseDraftResult | null {
    try {
        const parsed = JSON.parse(response) as {
            title?: unknown
            content?: unknown
        }

        const title = typeof parsed.title === 'string' ? normalizeValue(parsed.title) : ''
        const content = typeof parsed.content === 'string' ? normalizeValue(parsed.content) : ''

        if (!title || !content) return null

        return {
            title,
            content
        }
    } catch {
        return null
    }
}

async function recordKnowledgeDraftUsage(options: {
    organizationId: string
    supabase?: SupabaseClientLike
    systemPrompt: string
    userPrompt: string
    response: string
    usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
    } | null
}) {
    const { organizationId, supabase, systemPrompt, userPrompt, response, usage } = options

    if (usage) {
        await recordAiUsage({
            organizationId,
            category: 'lead_extraction',
            model: 'gpt-4o-mini',
            inputTokens: usage.prompt_tokens ?? 0,
            outputTokens: usage.completion_tokens ?? 0,
            totalTokens: usage.total_tokens ?? 0,
            metadata: {
                source: 'knowledge_ai_fill'
            },
            supabase
        })
        return
    }

    const inputTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt)
    const outputTokens = estimateTokenCount(response)

    await recordAiUsage({
        organizationId,
        category: 'lead_extraction',
        model: 'gpt-4o-mini',
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        metadata: {
            source: 'knowledge_ai_fill'
        },
        supabase
    })
}

export async function generateKnowledgeBaseDraftFromBrief(options: {
    organizationId: string
    locale: string
    brief: KnowledgeBaseDraftBrief
    supabase?: SupabaseClientLike
}): Promise<KnowledgeBaseDraftResult> {
    if (!hasAnyBriefContent(options.brief)) {
        throw new Error('Knowledge draft brief is empty')
    }

    if (!process.env.OPENAI_API_KEY) {
        throw new Error('OPENAI_API_KEY environment variable is not set')
    }

    const entitlement = await resolveOrganizationUsageEntitlement(options.organizationId, {
        supabase: options.supabase
    })

    if (!entitlement.isUsageAllowed) {
        throw new Error('Billing usage is locked')
    }

    const language = resolveDraftLanguage(options.locale)
    const systemPrompt = buildKnowledgeDraftSystemPrompt(language)
    const userPrompt = buildKnowledgeDraftUserPrompt(options.brief)
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        temperature: 0.3,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]
    })

    const response = completion.choices[0]?.message?.content?.trim()
    if (!response) {
        throw new Error('Knowledge draft response is empty')
    }

    await recordKnowledgeDraftUsage({
        organizationId: options.organizationId,
        supabase: options.supabase,
        systemPrompt,
        userPrompt,
        response,
        usage: completion.usage
    })

    const parsed = parseKnowledgeBaseDraftResponse(response)
    if (!parsed) {
        throw new Error('Knowledge draft response is invalid')
    }

    return parsed
}
