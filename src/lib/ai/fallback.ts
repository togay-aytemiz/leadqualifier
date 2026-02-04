'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { DEFAULT_FLEXIBLE_PROMPT, DEFAULT_STRICT_FALLBACK_TEXT, withBotNamePrompt } from '@/lib/ai/prompts'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import type { OrganizationAiSettings } from '@/types/database'

const FALLBACK_TOPICS_TR = ['fiyatlar', 'randevu', 'iptal/iade', 'hizmetler']
const FALLBACK_TOPICS_EN = ['pricing', 'appointments', 'cancellations/refunds', 'services']
const FALLBACK_TOPIC_LIMIT = 6

const TURKISH_HINTS = ['nedir', 'ne', 'nasıl', 'fiyat', 'randevu', 'iptal', 'iade', 'kampanya', 'paket', 'yardımcı']

function isLikelyTurkish(message: string) {
    const normalized = message.toLowerCase()
    if (/[çğıöşü]/i.test(normalized)) return true
    return TURKISH_HINTS.some((hint) => normalized.includes(hint))
}

function formatTopicList(topics: string[]) {
    return topics.map((topic) => topic.trim()).filter(Boolean).join(', ')
}

async function getFallbackTopics(
    supabase: any,
    organizationId: string,
    limit: number
): Promise<string[]> {
    const [skillsResult, docsResult] = await Promise.all([
        supabase
            .from('skills')
            .select('title, enabled')
            .eq('organization_id', organizationId)
            .eq('enabled', true)
            .order('updated_at', { ascending: false })
            .limit(12),
        supabase
            .from('knowledge_documents')
            .select('title, status')
            .eq('organization_id', organizationId)
            .eq('status', 'ready')
            .order('updated_at', { ascending: false })
            .limit(12)
    ])

    const topicPool = [
        ...(skillsResult.data ?? []).map((item: any) => item.title),
        ...(docsResult.data ?? []).map((item: any) => item.title)
    ]

    const seen = new Set<string>()
    const topics: string[] = []

    for (const title of topicPool) {
        const normalized = (title ?? '').toString().trim()
        if (!normalized) continue
        const key = normalized.toLowerCase()
        if (seen.has(key)) continue
        seen.add(key)
        topics.push(normalized)
        if (topics.length >= limit) break
    }

    return topics
}

function renderStrictFallback(text: string, topics: string[], message: string) {
    const fallbackText = text?.trim() || DEFAULT_STRICT_FALLBACK_TEXT
    const isTurkish = isLikelyTurkish(message)
    const fallbackTopics = topics.length > 0
        ? formatTopicList(topics)
        : formatTopicList(isTurkish ? FALLBACK_TOPICS_TR : FALLBACK_TOPICS_EN)

    if (fallbackText.includes('{topics}')) {
        return fallbackText.replace('{topics}', fallbackTopics)
    }

    return fallbackText
}

async function renderFlexibleFallback(
    prompt: string,
    topics: string[],
    message: string,
    botName: string,
    options: {
        organizationId: string
        supabase?: any
        trackUsage?: boolean
        usageMetadata?: Record<string, any>
    }
): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        return renderStrictFallback(DEFAULT_STRICT_FALLBACK_TEXT, topics, message)
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const topicsList = topics.length > 0
        ? formatTopicList(topics)
        : formatTopicList(isLikelyTurkish(message) ? FALLBACK_TOPICS_TR : FALLBACK_TOPICS_EN)

    const systemPrompt = withBotNamePrompt(prompt || DEFAULT_FLEXIBLE_PROMPT, botName)

    const userPrompt = `Available topics: ${topicsList}\n\nUser message: ${message}`

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        })

        const response = completion.choices[0]?.message?.content?.trim()
        const usage = completion.usage
            ? {
                inputTokens: completion.usage.prompt_tokens ?? 0,
                outputTokens: completion.usage.completion_tokens ?? 0,
                totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
            }
            : {
                inputTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt),
                outputTokens: estimateTokenCount(response ?? ''),
                totalTokens: estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt) + estimateTokenCount(response ?? '')
            }

        if (options.trackUsage !== false) {
            await recordAiUsage({
                organizationId: options.organizationId,
                category: 'fallback',
                model: 'gpt-4o-mini',
                inputTokens: usage.inputTokens,
                outputTokens: usage.outputTokens,
                totalTokens: usage.totalTokens,
                metadata: options.usageMetadata,
                supabase: options.supabase
            })
        }
        if (response) return response
    } catch (error) {
        console.error('Flexible fallback failed:', error)
    }

    return renderStrictFallback(DEFAULT_STRICT_FALLBACK_TEXT, topics, message)
}

export async function buildFallbackResponse(options: {
    organizationId: string
    message: string
    aiSettings?: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'>
    supabase?: any
    trackUsage?: boolean
    usageMetadata?: Record<string, any>
}) {
    const supabase = options.supabase ?? await createClient()
    const aiSettings = options.aiSettings ?? await getOrgAiSettings(options.organizationId, { supabase })
    const topics = await getFallbackTopics(supabase, options.organizationId, FALLBACK_TOPIC_LIMIT)

    return renderFlexibleFallback(
        aiSettings.prompt,
        topics,
        options.message,
        aiSettings.bot_name,
        {
            organizationId: options.organizationId,
            supabase,
            trackUsage: options.trackUsage,
            usageMetadata: options.usageMetadata
        }
    )
}
