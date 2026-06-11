import OpenAI from 'openai'
import sourceManifest from '@/lib/knowledge-base/provider-data/yiu-tanitim-gunleri-2026-source-manifest.json'
import { resolveMvpResponseLanguage } from '@/lib/ai/language'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { recordAiUsage } from '@/lib/ai/usage'
import { runOpenAiFileSearchValidatedQuestion } from '@/lib/knowledge-base/rag-eval/openai-file-search-validated'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'
import { BROCHURE_SOURCE_PRIORITY_GROUPS } from '@/lib/knowledge-base/rag-eval/brochure-query-plan'
import {
    findLatestRagPendingClarificationState,
    normalizeRagPendingClarificationState,
} from '@/lib/knowledge-base/rag-eval/pending-clarification-state'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagChunk } from '@/lib/knowledge-base/rag'
import type { DemoChatChannel } from '@/lib/demo-chat/channel'
import type { RagPendingClarificationState, RagProviderCitation } from '@/lib/knowledge-base/rag-eval/types'

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
const DEFAULT_RESEARCH_PLANNER_MODEL = 'gpt-4o-mini'

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

function readResearchPlannerEnabled(qualityMode: 'validated' | 'strict') {
    return qualityMode === 'strict' && process.env.DEMO_CHAT_FILE_SEARCH_RESEARCH_PLANNER !== '0'
}

function readStrictEvaluatorModel() {
    return process.env.DEMO_CHAT_FILE_SEARCH_EVALUATOR_MODEL?.trim()
        || process.env.OPENAI_RAG_EVALUATOR_MODEL?.trim()
        || DEFAULT_EVALUATOR_MODEL
}

function readResearchPlannerModel() {
    return process.env.DEMO_CHAT_FILE_SEARCH_RESEARCH_PLANNER_MODEL?.trim()
        || process.env.OPENAI_RAG_RESEARCH_PLANNER_MODEL?.trim()
        || DEFAULT_RESEARCH_PLANNER_MODEL
}

function usageModelName(input: {
    retrievalModel: string
    answerModel: string
    strictEvaluatorModel: string
    strictLlmEvaluatorEnabled: boolean
    researchPlannerModel: string
    researchPlannerEnabled: boolean
}) {
    return Array.from(new Set([
        input.retrievalModel,
        input.answerModel,
        ...(input.researchPlannerEnabled ? [input.researchPlannerModel] : []),
        ...(input.strictLlmEvaluatorEnabled ? [input.strictEvaluatorModel] : []),
    ])).join('+')
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

function splitStandaloneSourceUrls(answer: string) {
    const sourceUrls: string[] = []
    const proseLines: string[] = []

    for (const line of answer.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (/^https?:\/\/\S+$/i.test(trimmed)) {
            sourceUrls.push(trimmed)
        } else {
            proseLines.push(line)
        }
    }

    return {
        prose: proseLines.join('\n').trim(),
        sourceUrls: Array.from(new Set(sourceUrls)),
    }
}

function citationsToPolishChunks(citations: RagProviderCitation[], fallbackContent: string): RagChunk[] {
    const chunks = citations
        .map((citation): RagChunk | null => {
            const content = [citation.quote, citation.title].filter(Boolean).join('\n').trim()
            if (!content) return null
            return {
                content,
                similarity: citation.score,
                document_id: citation.providerSourceId,
                document_title: citation.title,
                chunk_id: citation.providerSourceId,
                source_url: citation.url ?? null,
            }
        })
        .filter((chunk): chunk is RagChunk => Boolean(chunk))

    if (chunks.length > 0) return chunks

    return [{
        content: fallbackContent,
        document_id: 'demo-file-search-final-answer',
        document_title: 'Validated final answer',
        chunk_id: 'demo-file-search-final-answer',
        source_url: null,
    }]
}

async function polishDemoFileSearchFinalAnswer(input: {
    answer: string
    userMessage: string
    settings: Awaited<ReturnType<typeof getOrgAiSettings>>
    answerModel: string
    citations: RagProviderCitation[]
}) {
    const { prose, sourceUrls } = splitStandaloneSourceUrls(input.answer)
    if (!prose) {
        return {
            answer: input.answer.trim(),
            polish: null,
        }
    }

    const polished = await polishGroundedRagAnswer({
        answer: prose,
        userMessage: input.userMessage,
        responseLanguage: resolveMvpResponseLanguage(input.userMessage),
        chunks: citationsToPolishChunks(input.citations, prose),
        settings: input.settings,
        model: input.answerModel,
    })
    const polishedProse = polished.answer.trim() || prose

    return {
        answer: [polishedProse, ...sourceUrls].join('\n').trim(),
        polish: {
            usedPolish: polished.usedPolish,
            addedEngagement: polished.addedEngagement,
            model: polished.model,
            usage: polished.usage,
        },
    }
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
        const researchPlannerEnabled = readResearchPlannerEnabled(qualityMode)
        const researchPlannerModel = readResearchPlannerModel()
        const vectorStoreId = readVectorStoreId()
        const openai = new OpenAI({ apiKey })
        const pendingClarification =
            normalizeRagPendingClarificationState(input.pendingClarification)
            ?? findLatestRagPendingClarificationState(input.conversationHistory ?? [])
        const result = await runOpenAiFileSearchValidatedQuestion({
            client: openai,
            model: retrievalModel,
            answerModel,
            vectorStoreId,
            question: input.message,
            conversationHistory: input.conversationHistory ?? [],
            pendingClarification: pendingClarification ?? undefined,
            instructionProfile: 'qualy',
            citationSourcesByFilename: sourceManifest.sourcesByFilename,
            sourcePriorityGroups: BROCHURE_SOURCE_PRIORITY_GROUPS,
            maxResults: 8,
            maxOutputTokens: 900,
            settings,
            qualityMode,
            enableStrictLlmEvaluator: strictLlmEvaluatorEnabled,
            strictEvaluatorModel,
            enableLlmResearchPlanner: researchPlannerEnabled,
            researchPlannerModel,
        })
        const providerPresentationPolish = result.diagnostics?.presentationPolish
        const finalPolish = providerPresentationPolish
            ? {
                answer: result.answer.trim(),
                polish: {
                    usedPolish: providerPresentationPolish.usedPolish,
                    addedEngagement: providerPresentationPolish.addedEngagement,
                    model: providerPresentationPolish.model,
                    usage: null,
                },
            }
            : await polishDemoFileSearchFinalAnswer({
                answer: result.answer,
                userMessage: input.message,
                settings,
                answerModel,
                citations: result.citations,
            })
        const answer = finalPolish.answer.trim()
        if (!answer) return null

        if (result.usage?.totalTokens || result.usage?.inputTokens || result.usage?.outputTokens) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: usageModelName({
                        retrievalModel,
                        answerModel,
                        strictEvaluatorModel,
                        strictLlmEvaluatorEnabled,
                        researchPlannerModel,
                        researchPlannerEnabled,
                    }),
                    inputTokens: result.usage.inputTokens,
                    outputTokens: result.usage.outputTokens,
                    totalTokens: result.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_openai_file_search_validated',
                        response_kind: 'rag_openai_file_search_validated',
                        demo_chat_channel_id: input.channel.id,
                        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
                        vector_store_id: vectorStoreId,
                        source_priority_groups: BROCHURE_SOURCE_PRIORITY_GROUPS,
                        quality_mode: qualityMode,
                        strict_llm_evaluator_enabled: strictLlmEvaluatorEnabled,
                        strict_evaluator_model: strictEvaluatorModel,
                        research_planner_enabled: researchPlannerEnabled,
                        research_planner_model: researchPlannerModel,
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
        if (finalPolish.polish?.usage) {
            try {
                await recordAiUsage({
                    organizationId: input.channel.organizationId,
                    category: 'rag',
                    model: finalPolish.polish.model,
                    inputTokens: finalPolish.polish.usage.inputTokens,
                    outputTokens: finalPolish.polish.usage.outputTokens,
                    totalTokens: finalPolish.polish.usage.totalTokens,
                    metadata: {
                        source: 'demo_chat_openai_file_search_final_polish',
                        response_kind: 'rag_openai_file_search_final_polish',
                        demo_chat_channel_id: input.channel.id,
                        ...(input.conversationId ? { conversation_id: input.conversationId } : {}),
                        vector_store_id: vectorStoreId,
                    },
                    supabase: input.supabase,
                })
            } catch (error) {
                console.error('Demo Chat: OpenAI File Search final polish usage recording failed; continuing reply flow', error)
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
                    research_planner_enabled: researchPlannerEnabled,
                    research_planner_model: researchPlannerModel,
                    source_priority_groups: BROCHURE_SOURCE_PRIORITY_GROUPS,
                    quality_mode: qualityMode,
                    refusal: result.refusal,
                    timings_ms: result.timingsMs,
                    diagnostics: result.diagnostics,
                    usage: result.usage,
                    final_polish: finalPolish.polish
                        ? {
                            usedPolish: finalPolish.polish.usedPolish,
                            addedEngagement: finalPolish.polish.addedEngagement,
                            model: finalPolish.polish.model,
                        }
                        : null,
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
