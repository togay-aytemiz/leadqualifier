import OpenAI from 'openai'
import sourceManifest from '@/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json'
import { resolveMvpResponseLanguage } from '@/lib/ai/language'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { recordAiUsage } from '@/lib/ai/usage'
import { runLlmFirstFileSearchPipeline } from '@/lib/knowledge-base/llm-first/pipeline'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { DemoChatChannel } from '@/lib/demo-chat/channel'
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
const DEFAULT_RETRIEVAL_MODEL = 'gpt-4.1-mini'
const DEFAULT_ANSWER_MODEL = 'gpt-4o-mini'

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

function readRetrievalModel() {
    return process.env.DEMO_CHAT_FILE_SEARCH_RETRIEVAL_MODEL?.trim()
        || DEFAULT_RETRIEVAL_MODEL
}

function readAnswerModel() {
    return process.env.DEMO_CHAT_FILE_SEARCH_ANSWER_MODEL?.trim()
        || DEFAULT_ANSWER_MODEL
}

function usageModelName(retrievalModel: string, answerModel: string) {
    return Array.from(new Set([retrievalModel, answerModel])).join('+')
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

export async function buildOpenAiFileSearchDemoReply(input: {
    supabase: SupabaseLike
    channel: DemoChatChannel
    message: string
    conversationId?: string | null
    conversationHistory?: KnowledgeSearchPlanningTurn[]
    pendingClarification?: RagPendingClarificationState | null
}) {
    if (!shouldUseOpenAiFileSearch(input.channel)) return null

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
        console.error('Demo Chat: OpenAI File Search is enabled but OPENAI_API_KEY is missing')
        return null
    }

    try {
        const responseLanguage = resolveDemoResponseLanguage(input.message, input.conversationHistory)
        const settings = await getOrgAiSettings(input.channel.organizationId, {
            supabase: input.supabase,
            locale: responseLanguage,
        })
        const retrievalModel = readRetrievalModel()
        const answerModel = readAnswerModel()
        const vectorStoreId = readVectorStoreId()
        const openai = new OpenAI({ apiKey })
        const result = await runLlmFirstFileSearchPipeline({
            client: openai,
            retrievalModel,
            answerModel,
            vectorStoreId,
            latestUserMessage: input.message,
            recentMessages: input.conversationHistory ?? [],
            responseLanguage,
            citationSourcesByFilename: sourceManifest.sourcesByFilename,
            maxResults: 20,
            settings,
        })
        const answer = result.answer.trim()
        if (!answer) return null

        if (result.usage?.totalTokens || result.usage?.inputTokens || result.usage?.outputTokens) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: usageModelName(retrievalModel, answerModel),
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    totalTokens: result.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_llm_first_file_search',
                        response_kind: 'rag_llm_first_file_search',
                        demo_chat_channel_id: input.channel.id,
                        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
                        vector_store_id: vectorStoreId,
                        conversation_history_turn_count: input.conversationHistory?.length ?? 0,
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
                demo_chat_reply_source: 'llm_first_file_search',
                rag_provider: result.provider,
                rag_file_search: {
                    vector_store_id: vectorStoreId,
                    retrieval_model: retrievalModel,
                    answer_model: answerModel,
                    pipeline_version: 'llm_first_v1',
                    refusal: result.refusal,
                    timings_ms: result.timingsMs,
                    diagnostics: result.diagnostics,
                    usage: result.usage,
                    final_polish: result.diagnostics?.presentationPolish ?? null,
                    conversation_history_turn_count: input.conversationHistory?.length ?? 0,
                },
                ...(result.diagnostics?.pendingClarification
                    ? { rag_pending_clarification: result.diagnostics.pendingClarification }
                    : {}),
                source_titles: citations.map((citation) => citation.title).filter(Boolean),
                source_urls: citations.map((citation) => citation.url).filter(Boolean),
                sources: citations,
            },
        } satisfies OpenAiFileSearchDemoReply
    } catch (error) {
        console.error('Demo Chat: OpenAI File Search reply failed; falling back to standard RAG', error)
        return null
    }
}
