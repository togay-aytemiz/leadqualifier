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
    ? 'Bu bilgiye onaylı kaynaklarda ulaşamadım.'
    : 'I could not find this information in the approved sources.'
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

function appendCitationUrls(answer: string, citations: RagProviderCitation[]) {
  const urls = Array.from(
    new Set(citations.map((citation) => citation.url?.trim()).filter((url): url is string => Boolean(url)))
  )
  return [answer.trim(), ...urls.filter((url) => !answer.includes(url))]
    .filter(Boolean)
    .join('\n')
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
    pendingClarification: input.pendingClarification,
    responseLanguage: input.responseLanguage,
    model: input.rewriteModel,
    createCompletion: input.rewriteCreateCompletion,
  })

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
          stateUsed: stateWasUsed(input.pendingClarification),
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
          stateUsed: stateWasUsed(input.pendingClarification),
          resultCount: 0,
          topScores: [],
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'refuse',
        },
      },
    }
  }

  const retrievalStartedAt = Date.now()
  const retrieval = await searchSimpleRagVectorStore({
    client: input.client,
    vectorStoreId: input.vectorStoreId,
    standaloneQuery: rewrite.plan.standaloneQuery,
    maxResults: input.maxResults,
    scoreThreshold: input.scoreThreshold,
    citationSourcesByFilename: input.citationSourcesByFilename,
  })
  const retrievalMs = Date.now() - retrievalStartedAt
  const baseDiagnostics = {
    queryIntent: 'simple_rag_search',
    contextualQuestion: input.latestUserMessage,
    contextualRetrievalIntent: rewrite.plan.standaloneQuery,
    retryCount: 0,
  } as const

  if (retrieval.chunks.length === 0) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(rewrite.plan.responseLanguage),
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs },
      usage: rewrite.usage,
      diagnostics: {
        ...baseDiagnostics,
        strictVerdict: 'no_verified_evidence',
        simpleRag: {
          standaloneQuery: rewrite.plan.standaloneQuery,
          stateUsed: stateWasUsed(input.pendingClarification),
          resultCount: 0,
          topScores: [],
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
    standaloneQuery: rewrite.plan.standaloneQuery,
    recentMessages: input.recentMessages,
    pendingClarification: input.pendingClarification,
    responseLanguage: rewrite.plan.responseLanguage,
    chunks: retrieval.chunks,
    settings: input.settings,
    model: input.answerModel,
    createCompletion: input.answerCreateCompletion,
  })
  const generationMs = Date.now() - generationStartedAt
  const usage = addUsage(rewrite.usage, generated.usage)
  const commonSimpleDiagnostics = {
    standaloneQuery: rewrite.plan.standaloneQuery,
    stateUsed: stateWasUsed(input.pendingClarification),
    resultCount: retrieval.chunks.length,
    topScores: retrieval.chunks.slice(0, 5).map((chunk) => chunk.score),
  }

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
          retrievalIntent: rewrite.plan.standaloneQuery,
        },
        strictVerdict: 'clarification_required',
        simpleRag: {
          ...commonSimpleDiagnostics,
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
          ...commonSimpleDiagnostics,
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
        strictVerdict: 'grounded_generation_rejected',
        simpleRag: {
          ...commonSimpleDiagnostics,
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
    answer: appendCitationUrls(generated.answer, citations),
    citations,
    refusal: false,
    timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: generationMs },
    usage,
    diagnostics: {
      ...baseDiagnostics,
      strictVerdict: 'verified_evidence_answer',
      simpleRag: {
        ...commonSimpleDiagnostics,
        selectedChunkIds: generated.usedChunkIds,
        selectedFilenames: generated.selectedChunks.map((chunk) => chunk.filename),
        answerStatus: 'answer',
      },
    },
  }
}
