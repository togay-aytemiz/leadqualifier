import OpenAI from 'openai'
import sourceManifest from '@/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json'
import { resolveMvpResponseLanguage } from '@/lib/ai/language'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getOrgAiDictionaryEntries } from '@/lib/ai/dictionary'
import { formatAiDictionaryContext } from '@/lib/ai/dictionary-core'
import { recordAiUsage } from '@/lib/ai/usage'
import { runOneStepFileSearch } from '@/lib/knowledge-base/simple-rag/one-step-file-search'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { DemoChatChannel } from '@/lib/demo-chat/channel'
import {
    buildDemoAssistantInstructionContext,
    resolveDemoOrganizationContext,
} from '@/lib/demo-chat/organization-context'
import {
    markSkillRoutingRagFallback,
    type DemoChatSkillRoutingDiagnostics,
} from '@/lib/demo-chat/skill-routing-diagnostics'
import type { RagPendingClarificationState } from '@/lib/knowledge-base/rag-eval/types'

type SupabaseLike = Parameters<typeof recordAiUsage>[0]['supabase']

type FileSearchCitationMetadata = {
    providerSourceId: string
    title?: string
    url?: string
    score?: number
}

export type OpenAiFileSearchDemoReply = {
    replyText: string
    metadata: Record<string, unknown>
}

const DEFAULT_FILE_SEARCH_DEMO_SLUGS = ['yiu-tanitim-gunleri-2026']
const DEFAULT_ANSWER_MODEL = 'gpt-5.5'
const DEFAULT_MAX_RESULTS = 20

function readEnabledSlugs() {
    const raw = process.env.DEMO_CHAT_FILE_SEARCH_SLUGS?.trim()
    if (!raw) return DEFAULT_FILE_SEARCH_DEMO_SLUGS

    return raw
        .split(',')
        .map((slug) => slug.trim().toLowerCase())
        .filter(Boolean)
}

function shouldUseOpenAiFileSearch(channel: DemoChatChannel) {
    if (process.env.DEMO_CHAT_FILE_SEARCH_ENABLED === '0') return false
    return readEnabledSlugs().includes(channel.slug.toLowerCase())
}

function readVectorStoreId() {
    return process.env.DEMO_CHAT_FILE_SEARCH_VECTOR_STORE_ID?.trim()
        || sourceManifest.vectorStoreId
}

function readAnswerModel() {
    return process.env.DEMO_CHAT_FILE_SEARCH_ANSWER_MODEL?.trim()
        || DEFAULT_ANSWER_MODEL
}

function readMaxResults() {
    const parsed = Number(process.env.DEMO_CHAT_FILE_SEARCH_MAX_RESULTS)
    if (!Number.isFinite(parsed)) return DEFAULT_MAX_RESULTS
    return Math.max(1, Math.min(50, Math.round(parsed)))
}

function mapCitationMetadata(citations: Array<{
    providerSourceId: string
    title?: string
    url?: string
    score?: number
}>): FileSearchCitationMetadata[] {
    return citations.map((citation) => ({
        providerSourceId: citation.providerSourceId,
        ...(citation.title ? { title: citation.title } : {}),
        ...(citation.url ? { url: citation.url } : {}),
        ...(typeof citation.score === 'number' ? { score: citation.score } : {}),
    }))
}

function recentUserHistoryMessages(history: KnowledgeSearchPlanningTurn[] | undefined) {
    return (history ?? [])
        .filter((turn) => turn.role === 'user' && turn.content.trim())
        .slice(-5)
        .reverse()
        .map((turn) => turn.content)
}

function resolveDemoResponseLanguage(
    message: string,
    history: KnowledgeSearchPlanningTurn[] | undefined
) {
    return resolveMvpResponseLanguage(message, {
        historyMessages: recentUserHistoryMessages(history),
    })
}

function buildSimpleRagUnavailableReply(input: {
    responseLanguage: 'tr' | 'en'
    failureReason: 'missing_api_key' | 'empty_answer' | 'pipeline_error'
    conversationHistoryCount: number
}): OpenAiFileSearchDemoReply {
    const vectorStoreId = readVectorStoreId()
    const answerModel = readAnswerModel()
    const maxResults = readMaxResults()

    return {
        replyText: input.responseLanguage === 'tr'
            ? 'Şu anda bilgi kaynağına erişemiyorum. Lütfen kısa süre sonra tekrar deneyin.'
            : 'I cannot access the knowledge source right now. Please try again shortly.',
        metadata: {
            is_rag: true,
            rag_extractive: false,
            demo_chat_reply_source: 'simple_standalone_query_rag',
            rag_provider: 'openai_file_search',
            rag_file_search: {
                vector_store_id: vectorStoreId,
                answer_model: answerModel,
                pipeline_version: 'one_step_responses_file_search_v1',
                max_results: maxResults,
                refusal: false,
                failure_reason: input.failureReason,
                conversation_history_turn_count: input.conversationHistoryCount,
            },
            source_titles: [],
            source_urls: [],
            sources: [],
        },
    }
}

export async function buildOpenAiFileSearchDemoReply(input: {
    supabase: SupabaseLike
    channel: DemoChatChannel
    message: string
    standaloneQuery?: string | null
    conversationId?: string | null
    conversationHistory?: KnowledgeSearchPlanningTurn[]
    pendingClarification?: RagPendingClarificationState | null
    skillRoutingDiagnostics?: DemoChatSkillRoutingDiagnostics | null
}) {
    if (!shouldUseOpenAiFileSearch(input.channel)) return null

    const responseLanguage = resolveDemoResponseLanguage(input.message, input.conversationHistory)
    const conversationHistoryCount = input.conversationHistory?.length ?? 0

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
        console.error('Demo Chat: OpenAI File Search is enabled but OPENAI_API_KEY is missing')
        return buildSimpleRagUnavailableReply({
            responseLanguage,
            failureReason: 'missing_api_key',
            conversationHistoryCount,
        })
    }

    try {
        const [settings, dictionaryEntries] = await Promise.all([
            getOrgAiSettings(input.channel.organizationId, {
                supabase: input.supabase,
                locale: responseLanguage,
            }),
            getOrgAiDictionaryEntries(input.channel.organizationId, {
                supabase: input.supabase,
                enabledOnly: true,
            }),
        ])
        const dictionaryContext = formatAiDictionaryContext(dictionaryEntries)
        const answerModel = readAnswerModel()
        const vectorStoreId = readVectorStoreId()
        const maxResults = readMaxResults()
        const openai = new OpenAI({ apiKey })
        const organizationContext = resolveDemoOrganizationContext({
            channelDisplayName: input.channel.displayName,
            settings,
        })
        const result = await runOneStepFileSearch({
            client: openai,
            model: answerModel,
            vectorStoreId,
            latestUserMessage: input.message,
            standaloneQuery: input.standaloneQuery,
            recentMessages: input.conversationHistory ?? [],
            organizationContext,
            assistantInstructionContext: buildDemoAssistantInstructionContext(settings),
            dictionaryContext,
            pendingClarification: input.pendingClarification,
            responseLanguage,
            citationSourcesByFilename: sourceManifest.sourcesByFilename,
            maxResults,
        })
        const answer = result.status === 'no_info'
            ? responseLanguage === 'tr'
                ? 'Bu konuda net bir bilgi bulamadım.'
                : 'I could not find clear information about this.'
            : result.answer.trim()
        if (!answer && result.status !== 'no_info') {
            return buildSimpleRagUnavailableReply({
                responseLanguage,
                failureReason: 'empty_answer',
                conversationHistoryCount,
            })
        }

        if (result.usage?.totalTokens || result.usage?.inputTokens || result.usage?.outputTokens) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: answerModel,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    totalTokens: result.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_one_step_file_search',
                        response_kind: 'rag_one_step_file_search',
                        demo_chat_channel_id: input.channel.id,
                        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
                        vector_store_id: vectorStoreId,
                        conversation_history_turn_count: conversationHistoryCount,
                        tool_calls: result.usage.toolCalls,
                        estimated_credits: result.usage.estimatedCredits,
                        diagnostics: result.diagnostics,
                    },
                    supabase: input.supabase,
                })
            } catch (error) {
                console.error('Demo Chat: OpenAI File Search usage recording failed; continuing reply flow', error)
            }
        }
        const citations = mapCitationMetadata(result.citations)

        return {
            replyText: answer,
            metadata: {
                is_rag: true,
                rag_extractive: false,
                demo_chat_reply_source: 'simple_standalone_query_rag',
                rag_provider: result.provider,
                rag_file_search: {
                    vector_store_id: vectorStoreId,
                    answer_model: answerModel,
                    pipeline_version: 'one_step_responses_file_search_v1',
                    max_results: maxResults,
                    answer_status: result.status,
                    refusal: result.refusal,
                    timings_ms: result.timingsMs,
                    diagnostics: result.diagnostics,
                    usage: result.usage,
                    dictionary_entry_count: dictionaryEntries.length,
                    conversation_history_turn_count: conversationHistoryCount,
                },
                ...(input.skillRoutingDiagnostics
                    ? {
                        demo_chat_skill_routing: markSkillRoutingRagFallback(
                            input.skillRoutingDiagnostics
                        )
                    }
                    : {}),
                source_titles: citations.map((citation) => citation.title).filter(Boolean),
                source_urls: citations.map((citation) => citation.url).filter(Boolean),
                sources: citations,
            },
        } satisfies OpenAiFileSearchDemoReply
    } catch (error) {
        console.error('Demo Chat: one-step File Search reply failed; returning temporary unavailable response', error)
        return buildSimpleRagUnavailableReply({
            responseLanguage,
            failureReason: 'pipeline_error',
            conversationHistoryCount,
        })
    }
}
