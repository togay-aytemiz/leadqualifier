import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type {
  RagPendingClarificationState,
  RagProviderCitation,
  RagProviderResult,
} from '@/lib/knowledge-base/rag-eval/types'

import {
  generateSimpleRagAnswer,
  type SimpleRagAnswerCreateCompletion,
} from './answer-generator'
import {
  rewriteSimpleRagQuery,
  type SimpleRagCreateCompletion,
} from './query-rewriter'
import {
  searchSimpleRagVectorStore,
  type SimpleRagChunk,
  type SimpleRagVectorSearchClient,
} from './vector-search'

type CitationSource = { title?: string; url?: string }
type Usage = { inputTokens?: number; outputTokens?: number; totalTokens?: number }

function addUsage(...items: Array<Usage | null | undefined>) {
  return items.reduce<Required<Usage>>(
    (total, item) => ({
      inputTokens: total.inputTokens + (item?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (item?.outputTokens ?? 0),
      totalTokens: total.totalTokens + (item?.totalTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  )
}

function noInformationAnswer(language: MvpResponseLanguage) {
  return language === 'tr'
    ? 'Bu konuda net bir bilgi bulamadım.'
    : 'I could not find clear information about this.'
}

function selectedCitations(chunks: SimpleRagChunk[]): RagProviderCitation[] {
  const seen = new Set<string>()
  const citations: RagProviderCitation[] = []

  for (const chunk of chunks) {
    const key = `${chunk.fileId}|${chunk.content}`
    if (seen.has(key)) continue
    seen.add(key)
    citations.push({
      providerSourceId: chunk.fileId,
      title: chunk.title,
      ...(chunk.url ? { url: chunk.url } : {}),
      quote: chunk.content,
      score: chunk.score,
    })
  }

  return citations
}

function stateWasUsed(state: RagPendingClarificationState | null | undefined) {
  return Boolean(state && (state.originalQuestion || state.clarificationQuestion))
}

export async function runSimpleRagPipeline(input: {
  client: SimpleRagVectorSearchClient
  vectorStoreId: string
  answerModel: string
  rewriteModel?: string
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  organizationContext?: string | null
  assistantInstructionContext?: string | null
  dictionaryContext?: string | null
  pendingClarification?: RagPendingClarificationState | null
  responseLanguage: MvpResponseLanguage
  settings?: { bot_name?: string | null; prompt?: string | null }
  citationSourcesByFilename?: Record<string, CitationSource>
  maxResults?: number
  scoreThreshold?: number
  rewriteCreateCompletion?: SimpleRagCreateCompletion
  answerCreateCompletion?: SimpleRagAnswerCreateCompletion
}): Promise<RagProviderResult> {
  const startedAt = Date.now()
  const rewrite = await rewriteSimpleRagQuery({
    latestUserMessage: input.latestUserMessage,
    recentMessages: input.recentMessages,
    organizationContext: input.organizationContext,
    assistantInstructionContext: input.assistantInstructionContext,
    dictionaryContext: input.dictionaryContext,
    assistantName: input.settings?.bot_name,
    pendingClarification: input.pendingClarification,
    responseLanguage: input.responseLanguage,
    model: input.rewriteModel,
    createCompletion: input.rewriteCreateCompletion,
  })

  const stateUsed = stateWasUsed(input.pendingClarification)

  if (rewrite.plan.status === 'respond') {
    return {
      provider: 'openai_file_search_validated',
      answer: rewrite.plan.response,
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt },
      usage: rewrite.usage,
      diagnostics: {
        queryIntent: 'simple_rag_respond',
        simpleRag: {
          stateUsed,
          resultCount: 0,
          topScores: [],
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'answer',
        },
      },
    }
  }

  if (rewrite.plan.status === 'clarify') {
    return {
      provider: 'openai_file_search_validated',
      answer: rewrite.plan.clarificationQuestion,
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt },
      usage: rewrite.usage,
      diagnostics: {
        queryIntent: 'simple_rag_clarify',
        clarification: rewrite.plan.clarificationQuestion,
        pendingClarification: {
          originalQuestion: input.latestUserMessage,
          clarificationQuestion: rewrite.plan.clarificationQuestion,
          missingSlots: [rewrite.plan.missingSlot],
        },
        simpleRag: {
          stateUsed,
          resultCount: 0,
          topScores: [],
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'clarify',
        },
      },
    }
  }

  if (rewrite.plan.status === 'refuse') {
    return {
      provider: 'openai_file_search_validated',
      answer: rewrite.plan.refusalResponse,
      citations: [],
      refusal: true,
      timingsMs: { total: Date.now() - startedAt },
      usage: rewrite.usage,
      diagnostics: {
        queryIntent: 'simple_rag_refuse',
        simpleRag: {
          stateUsed,
          resultCount: 0,
          topScores: [],
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'refuse',
        },
      },
    }
  }

  const standaloneQuery = rewrite.plan.standaloneQuery
  const retrievalStartedAt = Date.now()
  const retrieval = await searchSimpleRagVectorStore({
    client: input.client,
    vectorStoreId: input.vectorStoreId,
    standaloneQuery,
    maxResults: input.maxResults,
    scoreThreshold: input.scoreThreshold,
    citationSourcesByFilename: input.citationSourcesByFilename,
  })
  const retrievalMs = Date.now() - retrievalStartedAt
  const chunks = retrieval.chunks

  const simpleDiagnostics = (selectedChunkIds: string[] = []) => ({
    standaloneQuery,
    stateUsed,
    rawResultCount: chunks.length,
    resultCount: chunks.length,
    droppedChunkCount: 0,
    droppedChunkReasons: [],
    droppedChunkMatches: [],
    topScores: chunks.slice(0, 5).map((chunk) => chunk.score),
    retrievalAttempts: [
      {
        query: standaloneQuery,
        rawResultCount: chunks.length,
        resultCount: chunks.length,
        droppedChunkReasons: [],
        topResults: chunks.slice(0, 5).map((chunk) => ({
          id: chunk.id,
          filename: chunk.filename,
          title: chunk.title,
          score: chunk.score,
          selected: selectedChunkIds.includes(chunk.id),
        })),
      },
    ],
  })

  const baseDiagnostics = {
    queryIntent: 'simple_rag_search',
    contextualQuestion: input.latestUserMessage,
    contextualRetrievalIntent: standaloneQuery,
    retryCount: 0,
  } as const

  if (chunks.length === 0) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(rewrite.plan.responseLanguage),
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs },
      usage: rewrite.usage,
      diagnostics: {
        ...baseDiagnostics,
        strictVerdict: 'no_retrieved_evidence',
        simpleRag: {
          ...simpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'no_info',
        },
      },
    }
  }

  const generationStartedAt = Date.now()
  const generated = await generateSimpleRagAnswer({
    latestUserMessage: input.latestUserMessage,
    standaloneQuery,
    recentMessages: input.recentMessages,
    pendingClarification: input.pendingClarification,
    responseLanguage: rewrite.plan.responseLanguage,
    chunks,
    settings: input.settings,
    model: input.answerModel,
    createCompletion: input.answerCreateCompletion,
  })
  const generationMs = Date.now() - generationStartedAt
  const usage = addUsage(rewrite.usage, generated.usage)

  if (generated.status === 'clarify') {
    return {
      provider: 'openai_file_search_validated',
      answer: generated.clarificationQuestion,
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: generationMs },
      usage,
      diagnostics: {
        ...baseDiagnostics,
        clarification: generated.clarificationQuestion,
        pendingClarification: {
          originalQuestion: input.latestUserMessage,
          clarificationQuestion: generated.clarificationQuestion,
          missingSlots: [generated.missingSlot],
          retrievalIntent: standaloneQuery,
        },
        strictVerdict: 'clarification_required',
        simpleRag: {
          ...simpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'clarify',
        },
      },
    }
  }

  if (generated.status === 'refuse') {
    return {
      provider: 'openai_file_search_validated',
      answer: generated.refusalResponse,
      citations: [],
      refusal: true,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: generationMs },
      usage,
      diagnostics: {
        ...baseDiagnostics,
        strictVerdict: 'safety_refusal',
        simpleRag: {
          ...simpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'refuse',
        },
      },
    }
  }

  if (generated.status === 'no_info') {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(rewrite.plan.responseLanguage),
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: generationMs },
      usage,
      diagnostics: {
        ...baseDiagnostics,
        contextualReason: generated.reason,
        strictVerdict: 'grounded_generation_no_info',
        simpleRag: {
          ...simpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'no_info',
        },
      },
    }
  }

  const citations = selectedCitations(generated.selectedChunks)
  return {
    provider: 'openai_file_search_validated',
    answer: generated.answer,
    citations,
    refusal: false,
    timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: generationMs },
    usage,
    diagnostics: {
      ...baseDiagnostics,
      strictVerdict: 'grounded_evidence_answer',
      simpleRag: {
        ...simpleDiagnostics(generated.usedChunkIds),
        selectedChunkIds: generated.usedChunkIds,
        selectedFilenames: generated.selectedChunks.map((chunk) => chunk.filename),
        answerStatus: 'answer',
      },
    },
  }
}
