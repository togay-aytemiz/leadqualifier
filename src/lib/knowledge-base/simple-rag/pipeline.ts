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
  shouldVerifySimpleRagAnswer,
  verifySimpleRagAnswer,
  type SimpleRagVerifierCreateCompletion,
} from './answer-verifier'
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

function stateWasUsed(state: RagPendingClarificationState | null | undefined) {
  return Boolean(state && (state.originalQuestion || state.clarificationQuestion))
}

type RetrievalAttempt = {
  query: string
  chunks: SimpleRagChunk[]
  rawChunks: SimpleRagChunk[]
  droppedChunks: SimpleRagDroppedChunk[]
}

type AnswerVerifierDiagnostics = NonNullable<
  NonNullable<RagProviderResult['diagnostics']>['answerVerifier']
>

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
  verifierModel?: string
  verifierCreateCompletion?: SimpleRagVerifierCreateCompletion
  enableRiskVerifier?: boolean
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
  const retrievalAttempts: RetrievalAttempt[] = []
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
    const attempt = {
      query: args.query,
      chunks: filtered.chunks,
      rawChunks: retrieval.chunks,
      droppedChunks: filtered.dropped,
    }
    retrievalAttempts.push(attempt)
    droppedChunksAcrossAttempts.push(...filtered.dropped)
    return attempt
  }
  const retryQuery = buildSimpleRagRetryQuery({
    organizationContext: input.organizationContext,
    latestUserMessage: input.latestUserMessage,
    standaloneQuery,
    responseLanguage: rewrite.plan.responseLanguage,
  })
  const retryMaxResults = Math.max(input.maxResults ?? 0, 30)
  const retryScoreThreshold = Math.min(input.scoreThreshold ?? 0, 0.02)
  let activeRetryQuery = retryQuery
  let attempt = await runRetrievalAttempt({
    query: standaloneQuery,
    maxResults: input.maxResults,
    scoreThreshold: input.scoreThreshold,
  })
  let retryCount = 0
  let retryReason: string | undefined

  const runRetry = async (reason: string, overrideRetryQuery?: string) => {
    retryReason = reason
    retryCount = 1
    activeRetryQuery = overrideRetryQuery?.trim() || retryQuery
    attempt = await runRetrievalAttempt({
      query: activeRetryQuery,
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

  const commonSimpleDiagnostics = (selectedChunkIds: string[] = []) => ({
    standaloneQuery,
    retryQuery: retryCount ? activeRetryQuery : undefined,
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
    retrievalAttempts: retrievalAttempts.map((retrievalAttempt) => ({
      query: retrievalAttempt.query,
      rawResultCount: retrievalAttempt.rawChunks.length,
      resultCount: retrievalAttempt.chunks.length,
      droppedChunkReasons: retrievalAttempt.droppedChunks.map((chunk) => chunk.reason),
      topResults: retrievalAttempt.chunks.slice(0, 5).map((chunk) => ({
        id: chunk.id,
        filename: chunk.filename,
        title: chunk.title,
        score: chunk.score,
        selected: retrievalAttempt === attempt && selectedChunkIds.includes(chunk.id),
      })),
    })),
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
  let answerVerifierDiagnostics: AnswerVerifierDiagnostics | undefined
  let verifierRejectedReason: string | undefined
  let verifierClarification: {
    question: string
    missingSlot: string
    reason: string
  } | undefined
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
  let finalOrganizationViolation =
    finalGenerated.status === 'answer'
      ? answerViolatesOrganizationScope({
          answer: finalGenerated.answer,
          organizationContext: input.organizationContext,
        })
      : { violates: false as const }

  if (
    finalGenerated.status === 'answer' &&
    !finalOrganizationViolation.violates &&
    shouldVerifySimpleRagAnswer({
      latestUserMessage: input.latestUserMessage,
      answer: finalGenerated.answer,
    }) &&
    (input.verifierCreateCompletion ||
      (input.enableRiskVerifier === true && Boolean(process.env.OPENAI_API_KEY?.trim())))
  ) {
    try {
      const verification = await verifySimpleRagAnswer({
        latestUserMessage: input.latestUserMessage,
        standaloneQuery: attempt.query,
        recentMessages: input.recentMessages,
        responseLanguage: rewrite.plan.responseLanguage,
        answer: finalGenerated.answer,
        chunks: finalGenerated.selectedChunks.length ? finalGenerated.selectedChunks : attempt.chunks,
        model: input.verifierModel,
        createCompletion: input.verifierCreateCompletion,
      })
      usage = addUsage(usage, verification.usage)
      answerVerifierDiagnostics = {
        used: true,
        action: verification.action,
        reason: verification.reason,
        ...(verification.action === 'retry_search'
          ? { retryQuery: verification.retryQuery }
          : {}),
        model: verification.model,
      }

      if (verification.action === 'retry_search') {
        if (retryCount > 0) {
          verifierRejectedReason = verification.reason
        } else {
          await runRetry(`verifier_retry:${verification.reason}`, verification.retryQuery)
          if (attempt.chunks.length === 0) {
            verifierRejectedReason = verification.reason
          } else {
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
            usage = addUsage(usage, finalGenerated.usage)
            finalOrganizationViolation =
              finalGenerated.status === 'answer'
                ? answerViolatesOrganizationScope({
                    answer: finalGenerated.answer,
                    organizationContext: input.organizationContext,
                  })
                : { violates: false as const }
          }
        }
      } else if (verification.action === 'no_info') {
        verifierRejectedReason = verification.reason
      } else if (verification.action === 'clarify') {
        verifierClarification = {
          question: verification.clarificationQuestion,
          missingSlot: verification.missingSlot,
          reason: verification.reason,
        }
      }
    } catch (error) {
      answerVerifierDiagnostics = {
        used: true,
        action: 'error',
        reason: error instanceof Error ? error.message : String(error),
        ...(input.verifierModel ? { model: input.verifierModel } : {}),
      }
    }
  }

  const finalBaseDiagnostics = {
    ...baseDiagnostics,
    retryCount,
  }

  if (verifierClarification) {
    return {
      provider: 'openai_file_search_validated',
      answer: verifierClarification.question,
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
      usage,
      diagnostics: {
        ...finalBaseDiagnostics,
        clarification: verifierClarification.question,
        contextualReason: verifierClarification.reason,
        pendingClarification: {
          originalQuestion: input.latestUserMessage,
          clarificationQuestion: verifierClarification.question,
          missingSlots: [verifierClarification.missingSlot],
          retrievalIntent: attempt.query,
        },
        strictVerdict: 'verifier_clarification_required',
        ...(answerVerifierDiagnostics ? { answerVerifier: answerVerifierDiagnostics } : {}),
        simpleRag: {
          ...commonSimpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'clarify',
        },
      },
    }
  }

  if (verifierRejectedReason) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(rewrite.plan.responseLanguage),
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
      usage,
      diagnostics: {
        ...finalBaseDiagnostics,
        contextualReason: verifierRejectedReason,
        strictVerdict: 'risk_verifier_rejected',
        ...(answerVerifierDiagnostics ? { answerVerifier: answerVerifierDiagnostics } : {}),
        simpleRag: {
          ...commonSimpleDiagnostics(),
          selectedChunkIds: [],
          selectedFilenames: [],
          answerStatus: 'no_info',
        },
      },
    }
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
        ...(answerVerifierDiagnostics ? { answerVerifier: answerVerifierDiagnostics } : {}),
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
        ...(answerVerifierDiagnostics ? { answerVerifier: answerVerifierDiagnostics } : {}),
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
        ...(answerVerifierDiagnostics ? { answerVerifier: answerVerifierDiagnostics } : {}),
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
    answer: finalGenerated.answer,
    citations,
    refusal: false,
    timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs, generation: finalGenerationMs },
    usage,
    diagnostics: {
      ...finalBaseDiagnostics,
      strictVerdict: 'verified_evidence_answer',
      ...(answerVerifierDiagnostics ? { answerVerifier: answerVerifierDiagnostics } : {}),
      simpleRag: {
        ...commonSimpleDiagnostics(finalGenerated.usedChunkIds),
        selectedChunkIds: finalGenerated.usedChunkIds,
        selectedFilenames: finalGenerated.selectedChunks.map((chunk) => chunk.filename),
        answerStatus: 'answer',
      },
    },
  }
}
