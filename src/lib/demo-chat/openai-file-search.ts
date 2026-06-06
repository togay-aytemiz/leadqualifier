import OpenAI from 'openai'
import sourceManifest from '@/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json'
import { resolveMvpResponseLanguage } from '@/lib/ai/language'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { recordAiUsage } from '@/lib/ai/usage'
import { runOpenAiFileSearchValidatedQuestion } from '@/lib/knowledge-base/rag-eval/openai-file-search-validated'
import type { DemoChatChannel } from '@/lib/demo-chat/channel'

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
const DEFAULT_EVALUATOR_MODEL = 'gpt-4o-mini'

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

function readQualityMode(): 'validated' | 'strict' {
    return process.env.DEMO_CHAT_FILE_SEARCH_STRICT_QUALITY === '0'
        ? 'validated'
        : 'strict'
}

function readStrictLlmEvaluatorEnabled(qualityMode: 'validated' | 'strict') {
    return qualityMode === 'strict' && process.env.DEMO_CHAT_FILE_SEARCH_LLM_EVALUATOR !== '0'
}

function readStrictEvaluatorModel() {
    return process.env.DEMO_CHAT_FILE_SEARCH_EVALUATOR_MODEL?.trim()
        || process.env.OPENAI_RAG_EVALUATOR_MODEL?.trim()
        || DEFAULT_EVALUATOR_MODEL
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

export async function buildOpenAiFileSearchDemoReply(input: {
    supabase: SupabaseLike
    channel: DemoChatChannel
    message: string
    conversationId?: string | null
}) {
    if (!shouldUseOpenAiFileSearch(input.channel)) return null

    const apiKey = process.env.OPENAI_API_KEY?.trim()
    if (!apiKey) {
        console.error('Demo Chat: OpenAI File Search is enabled but OPENAI_API_KEY is missing')
        return null
    }

    try {
        const responseLanguage = resolveMvpResponseLanguage(input.message)
        const settings = await getOrgAiSettings(input.channel.organizationId, {
            supabase: input.supabase,
            locale: responseLanguage,
        })
        const retrievalModel = readRetrievalModel()
        const answerModel = readAnswerModel()
        const qualityMode = readQualityMode()
        const strictLlmEvaluatorEnabled = readStrictLlmEvaluatorEnabled(qualityMode)
        const strictEvaluatorModel = readStrictEvaluatorModel()
        const vectorStoreId = readVectorStoreId()
        const openai = new OpenAI({ apiKey })
        const result = await runOpenAiFileSearchValidatedQuestion({
            client: openai,
            model: retrievalModel,
            answerModel,
            vectorStoreId,
            question: input.message,
            instructionProfile: 'qualy',
            citationSourcesByFilename: sourceManifest.sourcesByFilename,
            maxResults: 8,
            maxOutputTokens: 900,
            settings,
            qualityMode,
            enableStrictLlmEvaluator: strictLlmEvaluatorEnabled,
            strictEvaluatorModel,
        })
        const answer = result.answer.trim()
        if (!answer) return null

        if (result.usage?.totalTokens || result.usage?.inputTokens || result.usage?.outputTokens) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: strictLlmEvaluatorEnabled
                        ? `${retrievalModel}+${answerModel}+${strictEvaluatorModel}`
                        : retrievalModel === answerModel
                            ? retrievalModel
                            : `${retrievalModel}+${answerModel}`,
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    totalTokens: result.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_openai_file_search_validated',
                        response_kind: 'rag_openai_file_search_validated',
                        demo_chat_channel_id: input.channel.id,
                        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
                        vector_store_id: vectorStoreId,
                        quality_mode: qualityMode,
                        strict_llm_evaluator_enabled: strictLlmEvaluatorEnabled,
                        strict_evaluator_model: strictEvaluatorModel,
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
                demo_chat_reply_source: 'openai_file_search_validated',
                rag_provider: result.provider,
                rag_file_search: {
                    vector_store_id: vectorStoreId,
                    retrieval_model: retrievalModel,
                    answer_model: answerModel,
                    strict_evaluator_model: strictEvaluatorModel,
                    strict_llm_evaluator_enabled: strictLlmEvaluatorEnabled,
                    quality_mode: qualityMode,
                    refusal: result.refusal,
                    timings_ms: result.timingsMs,
                    diagnostics: result.diagnostics,
                    usage: result.usage,
                },
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
