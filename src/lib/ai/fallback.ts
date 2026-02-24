'use server'

import OpenAI from 'openai'
import { createClient } from '@/lib/supabase/server'
import { getOrgAiSettings } from '@/lib/ai/settings'
import {
    DEFAULT_FLEXIBLE_PROMPT,
    DEFAULT_STRICT_FALLBACK_TEXT,
    DEFAULT_STRICT_FALLBACK_TEXT_EN,
    withBotNamePrompt
} from '@/lib/ai/prompts'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { recordAiUsage } from '@/lib/ai/usage'
import { resolveOrganizationUsageEntitlement } from '@/lib/billing/entitlements'
import {
    analyzeRequiredIntakeState,
    buildRequiredIntakeFollowupGuidance,
    type RequiredIntakeStateAnalysis
} from '@/lib/ai/followup'
import { resolveMvpResponseLanguage, type MvpResponseLanguage } from '@/lib/ai/language'
import { applyLiveAssistantResponseGuards } from '@/lib/ai/response-guards'
import {
    buildConversationContinuityGuidance,
    type ConversationHistoryTurn,
    stripRepeatedGreeting,
    toOpenAiConversationMessages
} from '@/lib/ai/conversation'
import type { OrganizationAiSettings } from '@/types/database'

const FALLBACK_TOPICS_TR = ['fiyatlar', 'randevu', 'iptal/iade', 'hizmetler']
const FALLBACK_TOPICS_EN = ['pricing', 'appointments', 'cancellations/refunds', 'services']
const FALLBACK_TOPIC_LIMIT = 6
const FALLBACK_MAX_OUTPUT_TOKENS = 320
const FALLBACK_KB_HINT_THRESHOLD = 0.12
const FALLBACK_KB_HINT_LIMIT = 3
const FALLBACK_KB_HINT_MAX_CHARS = 1500
type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

function resolveFallbackLanguage(message: string, preferredLanguage?: MvpResponseLanguage) {
    if (preferredLanguage === 'tr' || preferredLanguage === 'en') return preferredLanguage
    return resolveMvpResponseLanguage(message)
}

function formatTopicList(topics: string[]) {
    return topics.map((topic) => topic.trim()).filter(Boolean).join(', ')
}

function normalizeKnowledgeContextHint(rawContext: string) {
    return rawContext
        .trim()
        .replace(/\s+/g, ' ')
        .slice(0, FALLBACK_KB_HINT_MAX_CHARS)
}

async function getFallbackTopics(
    supabase: SupabaseClientLike,
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
        ...(skillsResult.data ?? []).map((item: { title?: string | null }) => item.title),
        ...(docsResult.data ?? []).map((item: { title?: string | null }) => item.title)
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

function renderStrictFallback(
    text: string,
    topics: string[],
    language: MvpResponseLanguage,
    userMessage: string,
    intakeAnalysis?: RequiredIntakeStateAnalysis | null
) {
    const languageDefault = language === 'tr'
        ? DEFAULT_STRICT_FALLBACK_TEXT
        : DEFAULT_STRICT_FALLBACK_TEXT_EN
    const fallbackText = text?.trim() || languageDefault
    const fallbackTopics = topics.length > 0
        ? formatTopicList(topics)
        : formatTopicList(language === 'tr' ? FALLBACK_TOPICS_TR : FALLBACK_TOPICS_EN)

    if (fallbackText.includes('{topics}')) {
        const rendered = fallbackText.replace('{topics}', fallbackTopics)
        return applyLiveAssistantResponseGuards({
            response: rendered,
            userMessage,
            responseLanguage: language,
            recentAssistantMessages: [],
            blockedReaskFields: intakeAnalysis?.blockedReaskFields ?? [],
            suppressIntakeQuestions: intakeAnalysis?.suppressIntakeQuestions ?? false,
            noProgressLoopBreak: intakeAnalysis?.noProgressStreak ?? false
        })
    }

    return applyLiveAssistantResponseGuards({
        response: fallbackText,
        userMessage,
        responseLanguage: language,
        recentAssistantMessages: [],
        blockedReaskFields: intakeAnalysis?.blockedReaskFields ?? [],
        suppressIntakeQuestions: intakeAnalysis?.suppressIntakeQuestions ?? false,
        noProgressLoopBreak: intakeAnalysis?.noProgressStreak ?? false
    })
}

async function renderFlexibleFallback(
    prompt: string,
    topics: string[],
    message: string,
    language: MvpResponseLanguage,
    botName: string,
    followupGuidance: string | null,
    options: {
        organizationId: string
        supabase?: SupabaseClientLike
        trackUsage?: boolean
        usageMetadata?: Record<string, unknown>
        conversationHistory?: ConversationHistoryTurn[]
        recentAssistantMessages?: string[]
        leadSnapshot?: {
            service_type?: string | null
            extracted_fields?: Record<string, unknown> | null
        } | null
        intakeAnalysis?: RequiredIntakeStateAnalysis | null
        knowledgeContext?: string | null
    }
): Promise<string> {
    if (!process.env.OPENAI_API_KEY) {
        return renderStrictFallback('', topics, language, message, options.intakeAnalysis)
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
    const languageName = language === 'tr' ? 'Turkish' : 'English'
    const topicsList = topics.length > 0
        ? formatTopicList(topics)
        : formatTopicList(language === 'tr' ? FALLBACK_TOPICS_TR : FALLBACK_TOPICS_EN)

    const basePrompt = withBotNamePrompt(prompt || DEFAULT_FLEXIBLE_PROMPT, botName)
    const continuityGuidance = buildConversationContinuityGuidance({
        recentAssistantMessages: options.recentAssistantMessages ?? [],
        leadSnapshot: options.leadSnapshot
    })
    const topicGuidance = `When you need to guide the user, stay within these available business topics: ${topicsList}.
If the request is outside scope, politely redirect to the most relevant available topics.`
    const languageGuidance = `Reply language policy (MVP): use ${languageName} only. If the message is not Turkish, use English.`
    const groundedKnowledgeGuidance = options.knowledgeContext?.trim()
        ? `If relevant to the user's request, prefer grounded details from this context and avoid generic fallback phrasing:
${options.knowledgeContext.trim()}
If the request is still outside this context, state that clearly and offer one concise next step.`
        : ''
    const systemPrompt = followupGuidance
        ? `${basePrompt}\n\n${languageGuidance}\n\n${topicGuidance}${groundedKnowledgeGuidance ? `\n\n${groundedKnowledgeGuidance}` : ''}\n\n${continuityGuidance}\n\n${followupGuidance}`
        : `${basePrompt}\n\n${languageGuidance}\n\n${topicGuidance}${groundedKnowledgeGuidance ? `\n\n${groundedKnowledgeGuidance}` : ''}\n\n${continuityGuidance}`
    const historyMessages = toOpenAiConversationMessages(options.conversationHistory ?? [], message, 10)

    try {
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.3,
            max_tokens: FALLBACK_MAX_OUTPUT_TOKENS,
            messages: [
                { role: 'system', content: systemPrompt },
                ...historyMessages,
                { role: 'user', content: message }
            ]
        })

        const response = completion.choices[0]?.message?.content?.trim()
        const polishedResponse = response
            ? stripRepeatedGreeting(response, options.recentAssistantMessages ?? [])
            : ''
        const guardedResponse = polishedResponse
            ? applyLiveAssistantResponseGuards({
                response: polishedResponse,
                userMessage: message,
                responseLanguage: language,
                recentAssistantMessages: options.recentAssistantMessages ?? [],
                blockedReaskFields: options.intakeAnalysis?.blockedReaskFields ?? [],
                suppressIntakeQuestions: options.intakeAnalysis?.suppressIntakeQuestions ?? false,
                noProgressLoopBreak: options.intakeAnalysis?.noProgressStreak ?? false
            })
            : ''
        const historyTokenCount = historyMessages.reduce(
            (total, item) => total + estimateTokenCount(item.content),
            0
        )
        const usage = completion.usage
            ? {
                inputTokens: completion.usage.prompt_tokens ?? 0,
                outputTokens: completion.usage.completion_tokens ?? 0,
                totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
            }
            : {
                inputTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(message),
                outputTokens: estimateTokenCount(guardedResponse ?? ''),
                totalTokens: estimateTokenCount(systemPrompt) + historyTokenCount + estimateTokenCount(message) + estimateTokenCount(guardedResponse ?? '')
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
        if (guardedResponse) return guardedResponse
    } catch (error) {
        console.error('Flexible fallback failed:', error)
    }

    return renderStrictFallback('', topics, language, message, options.intakeAnalysis)
}

export async function buildFallbackResponse(options: {
    organizationId: string
    message: string
    preferredLanguage?: MvpResponseLanguage
    requiredIntakeFields?: string[]
    recentCustomerMessages?: string[]
    recentAssistantMessages?: string[]
    conversationHistory?: ConversationHistoryTurn[]
    leadSnapshot?: {
        service_type?: string | null
        extracted_fields?: Record<string, unknown> | null
    } | null
    aiSettings?: Omit<OrganizationAiSettings, 'organization_id' | 'created_at' | 'updated_at'>
    supabase?: SupabaseClientLike
    trackUsage?: boolean
    usageMetadata?: Record<string, unknown>
    requiredIntakeAnalysis?: RequiredIntakeStateAnalysis
    knowledgeContext?: string | null
}) {
    const supabase = options.supabase ?? await createClient()
    const aiSettings = options.aiSettings ?? await getOrgAiSettings(options.organizationId, { supabase })
    const topics = await getFallbackTopics(supabase, options.organizationId, FALLBACK_TOPIC_LIMIT)
    const language = resolveFallbackLanguage(options.message, options.preferredLanguage)
    const requiredIntakeAnalysis = options.requiredIntakeAnalysis ?? analyzeRequiredIntakeState({
        requiredFields: options.requiredIntakeFields ?? [],
        recentCustomerMessages: options.recentCustomerMessages ?? [],
        recentAssistantMessages: options.recentAssistantMessages ?? [],
        leadSnapshot: options.leadSnapshot ?? null
    })
    const entitlement = await resolveOrganizationUsageEntitlement(options.organizationId, { supabase })
    if (!entitlement.isUsageAllowed) {
        return renderStrictFallback(
            '',
            topics,
            language,
            options.message,
            requiredIntakeAnalysis
        )
    }

    let groundedKnowledgeContext = options.knowledgeContext?.trim() ?? ''
    if (!groundedKnowledgeContext) {
        try {
            const [{ searchKnowledgeBase }, { buildRagContext }] = await Promise.all([
                import('@/lib/knowledge-base/actions'),
                import('@/lib/knowledge-base/rag')
            ])
            const hintResults = await searchKnowledgeBase(
                options.message,
                options.organizationId,
                FALLBACK_KB_HINT_THRESHOLD,
                FALLBACK_KB_HINT_LIMIT,
                { supabase }
            )
            if (hintResults && hintResults.length > 0) {
                const { context } = buildRagContext(hintResults)
                if (context?.trim()) {
                    groundedKnowledgeContext = normalizeKnowledgeContextHint(context)
                }
            }
        } catch (error) {
            console.warn('Fallback knowledge hint lookup failed:', error)
        }
    }
    const followupGuidance = buildRequiredIntakeFollowupGuidance(
        options.requiredIntakeFields ?? [],
        options.recentCustomerMessages ?? [],
        options.recentAssistantMessages ?? [],
        {
            analysis: requiredIntakeAnalysis,
            leadSnapshot: options.leadSnapshot ?? null
        }
    )

    return renderFlexibleFallback(
        aiSettings.prompt,
        topics,
        options.message,
        language,
        aiSettings.bot_name,
        followupGuidance,
        {
            organizationId: options.organizationId,
            supabase,
            trackUsage: options.trackUsage,
            usageMetadata: options.usageMetadata,
            conversationHistory: options.conversationHistory,
            recentAssistantMessages: options.recentAssistantMessages,
            leadSnapshot: options.leadSnapshot,
            intakeAnalysis: requiredIntakeAnalysis,
            knowledgeContext: groundedKnowledgeContext || null
        }
    )
}
