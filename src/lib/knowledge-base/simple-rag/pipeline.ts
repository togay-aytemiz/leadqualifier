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
import {
  answerViolatesOrganizationScope,
  buildSimpleRagRetryQuery,
  filterSimpleRagChunks,
  type SimpleRagDroppedChunk,
} from './retrieval-guards'

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

type RetrievalAttempt = {
  query: string
  chunks: SimpleRagChunk[]
  rawChunks: SimpleRagChunk[]
  droppedChunks: SimpleRagDroppedChunk[]
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
    assistantName: input.settings?.bot_name,
    pendingClarification: input.pendingClarification,
    responseLanguage: input.responseLanguage,
    model: input.rewriteModel,
    createCompletion: input.rewriteCreateCompletion,
  })

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
          stateUsed: stateWasUsed(input.pendingClarification),
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

  const standaloneQuery = rewrite.plan.standaloneQuery
  let retrievalMs = 0
  const droppedChunksAcrossAttempts: SimpleRagDroppedChunk[] = []
  const runRetrievalAttempt = async (args: {
    query: string
    maxResults?: number
    scoreThreshold?: number
  }): Promise<RetrievalAttempt> => {
    const retrievalStartedAt = Date.now()
    const retrieval = await searchSimpleRagVectorStore({
      client: input.client,
      vectorStoreId: input.vectorStoreId,
      standaloneQuery: args.query,
      maxResults: args.maxResults,
      scoreThreshold: args.scoreThreshold,
      citationSourcesByFilename: input.citationSourcesByFilename,
    })
    retrievalMs += Date.now() - retrievalStartedAt
    const filtered = filterSimpleRagChunks({
      chunks: retrieval.chunks,
      organizationContext: input.organizationContext,
      latestUserMessage: input.latestUserMessage,
      standaloneQuery: args.query,
    })
    droppedChunksAcrossAttempts.push(...filtered.dropped)
    return {
      query: args.query,
      chunks: filtered.chunks,
      rawChunks: retrieval.chunks,
      droppedChunks: filtered.dropped,
    }
  }
  const retryQuery = buildSimpleRagRetryQuery({
    organizationContext: input.organizationContext,
    latestUserMessage: input.latestUserMessage,
    standaloneQuery,
    responseLanguage: rewrite.plan.responseLanguage,
  })
  const retryMaxResults = Math.max(input.maxResults ?? 0, 30)
  const retryScoreThreshold = Math.min(input.scoreThreshold ?? 0, 0.02)
  let attempt = await runRetrievalAttempt({
    query: standaloneQuery,
    maxResults: input.maxResults,
    scoreThreshold: input.scoreThreshold,
  })
  let retryCount = 0
  let retryReason: string | undefined

  const runRetry = async (reason: string) => {
    retryReason = reason
    retryCount = 1
    attempt = await runRetrievalAttempt({
      query: retryQuery,
      maxResults: retryMaxResults,
      scoreThreshold: retryScoreThreshold,
    })
  }

  if (attempt.chunks.length === 0) {
    await runRetry(attempt.rawChunks.length > 0 ? 'all_chunks_filtered' : 'no_chunks')
  }

  const baseDiagnostics = {
    queryIntent: 'simple_rag_search',
    contextualQuestion: input.latestUserMessage,
    contextualRetrievalIntent: standaloneQuery,
    retryCount,
  } as const

  const commonSimpleDiagnostics = () => ({
    standaloneQuery,
    retryQuery: retryCount ? retryQuery : undefined,
    retryReason,
    retryScoreThreshold: retryCount ? retryScoreThreshold : undefined,
    stateUsed: stateWasUsed(input.pendingClarification),
    rawResultCount: attempt.rawChunks.length,
    resultCount: attempt.chunks.length,
    droppedChunkCount: droppedChunksAcrossAttempts.length,
    droppedChunkReasons: droppedChunksAcrossAttempts.map((chunk) => chunk.reason),
    droppedChunkMatches: droppedChunksAcrossAttempts
      .map((chunk) => chunk.matchedText)
      .filter((value): value is string => Boolean(value)),
    topScores: attempt.chunks.slice(0, 5).map((chunk) => chunk.score),
  })

  if (attempt.chunks.length === 0) {
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
          ...commonSimpleDiagnostics(),
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
    standaloneQuery: attempt.query,
    recentMessages: input.recentMessages,
    pendingClarification: input.pendingClarification,
    responseLanguage: rewrite.plan.responseLanguage,
    chunks: attempt.chunks,
    settings: input.settings,
    model: input.answerModel,
    createCompletion: input.answerCreateCompletion,
  })
  const generationMs = Date.now() - generationStartedAt
  let usage = addUsage(rewrite.usage, generated.usage)
  let finalGenerated = generated
  let finalGenerationMs = generationMs
  const organizationViolation =
    generated.status === 'answer'
      ? answerViolatesOrganizationScope({
          answer: generated.answer,
          organizationContext: input.organizationContext,
        })
      : { violates: false as const }

  if (
    retryCount === 0 &&
    (generated.status === 'no_info' || organizationViolation.violates)
  ) {
    const retryCause = organizationViolation.violates
      ? `answer_other_organization:${organizationViolation.matchedText}`
      : generated.status === 'no_info'
        ? `answer_${generated.reason}`
        : 'answer_rejected'
    await runRetry(retryCause)
    if (attempt.chunks.length > 0) {
      const retryGenerationStartedAt = Date.now()
      finalGenerated = await generateSimpleRagAnswer({
        latestUserMessage: input.latestUserMessage,
        standaloneQuery: attempt.query,
        recentMessages: input.recentMessages,
        pendingClarification: input.pendingClarification,
        responseLanguage: rewrite.plan.responseLanguage,
        chunks: attempt.chunks,
        settings: input.settings,
        model: input.answerModel,
        createCompletion: input.answerCreateCompletion,
      })
      finalGenerationMs += Date.now() - retryGenerationStartedAt
      usage = addUsage(rewrite.usage, generated.usage, finalGenerated.usage)
    }
  }
  const finalOrganizationViolation =
    finalGenerated.status === 'answer'
      ? answerViolatesOrganizationScope({
          answer: finalGenerated.answer,
          organizationContext: input.organizationContext,
        })
      : { violates: false as const }
  const finalBaseDiagnostics = {
    ...baseDiagnostics,
    retryCount,
  }

  if (finalGenerated.status === 'clarify') {
    return {
      provider: 'openai_file_search_validated',
      answer: finalGenerated.clarificationQuestion,
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
      usage,
      diagnostics: {
        ...finalBaseDiagnostics,
        clarification: finalGenerated.clarificationQuestion,
        pendingClarification: {
          originalQuestion: input.latestUserMessage,
          clarificationQuestion: finalGenerated.clarificationQuestion,
          missingSlots: [finalGenerated.missingSlot],
          retrievalIntent: attempt.query,
        },
        strictVerdict: 'clarification_required',
        simpleRag: {
          ...commonSimpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'clarify',
        },
      },
    }
  }

  if (finalGenerated.status === 'refuse') {
    return {
      provider: 'openai_file_search_validated',
      answer: finalGenerated.refusalResponse,
      citations: [],
      refusal: true,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
      usage,
      diagnostics: {
        ...finalBaseDiagnostics,
        strictVerdict: 'safety_refusal',
        simpleRag: {
          ...commonSimpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'refuse',
        },
      },
    }
  }

  if (finalGenerated.status === 'no_info' || finalOrganizationViolation.violates) {
    const rejectionReason = finalOrganizationViolation.violates
      ? `answer_other_organization:${finalOrganizationViolation.matchedText}`
      : finalGenerated.status === 'no_info'
        ? finalGenerated.reason
        : 'answer_rejected'
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(rewrite.plan.responseLanguage),
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
      usage,
      diagnostics: {
        ...finalBaseDiagnostics,
        contextualReason: rejectionReason,
        strictVerdict: 'grounded_generation_rejected',
        simpleRag: {
          ...commonSimpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'no_info',
        },
      },
    }
  }

  const citations = selectedCitations(finalGenerated.selectedChunks)
  return {
    provider: 'openai_file_search_validated',
    answer: appendCitationUrls(finalGenerated.answer, citations),
    citations,
    refusal: false,
    timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
    usage,
    diagnostics: {
      ...finalBaseDiagnostics,
      strictVerdict: 'verified_evidence_answer',
      simpleRag: {
        ...commonSimpleDiagnostics(),
        selectedChunkIds: finalGenerated.usedChunkIds,
        selectedFilenames: finalGenerated.selectedChunks.map((chunk) => chunk.filename),
        answerStatus: 'answer',
      },
    },
  }
}
