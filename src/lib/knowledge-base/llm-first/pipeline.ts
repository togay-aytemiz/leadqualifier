import { compileBehaviorPolicyFromSettings } from '@/lib/ai/behavior-policy'
import type { MvpResponseLanguage } from '@/lib/ai/language'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagChunk } from '@/lib/knowledge-base/rag'
import {
  runOpenAiFileSearchQuestion,
  type OpenAiFileSearchClient,
} from '@/lib/knowledge-base/rag-eval/openai-file-search'
import type {
  RagProviderCitation,
  RagProviderResult,
} from '@/lib/knowledge-base/rag-eval/types'

import {
  composeLlmFirstGroundedAnswer,
  type LlmFirstEvidenceCreateCompletion,
} from './evidence'
import {
  runLlmFirstTurnPlanner,
  type LlmFirstPlannerCreateCompletion,
} from './planner'

type CitationSource = { title?: string; url?: string }

type PolishCreateCompletion = (
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => Promise<{
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}>

function citationsToChunks(citations: RagProviderCitation[]): RagChunk[] {
  return citations
    .filter((citation) => citation.quote?.trim())
    .map((citation) => ({
      content: citation.quote!.trim(),
      document_id: citation.providerSourceId,
      document_title: citation.title,
      chunk_id: citation.providerSourceId,
      source_url: citation.url ?? null,
      similarity: citation.score,
    }))
}

function sourceChunkIds(chunks: RagChunk[] | undefined) {
  return new Set((chunks ?? []).map((chunk) => chunk.document_id).filter(Boolean))
}

function selectedCitations(citations: RagProviderCitation[], chunks: RagChunk[] | undefined) {
  const ids = sourceChunkIds(chunks)
  if (ids.size === 0) return citations
  return citations.filter((citation) => ids.has(citation.providerSourceId))
}

function protectedValues(value: string) {
  return Array.from(
    new Set([
      ...(value.match(/https?:\/\/[^\s]+/gi) ?? []),
      ...(value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
      ...(value.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? []),
      ...(value.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? []),
    ])
  )
}

function polishPreservesFacts(before: string, after: string) {
  const beforeValues = protectedValues(before)
  const afterValues = protectedValues(after)
  return (
    beforeValues.every((value) => after.includes(value)) &&
    afterValues.every((value) => before.includes(value))
  )
}

function appendCitationUrls(answer: string, citations: RagProviderCitation[]) {
  const urls = Array.from(
    new Set(citations.map((citation) => citation.url?.trim()).filter((url): url is string => Boolean(url)))
  )
  if (urls.length === 0) return answer.trim()
  return [answer.trim(), ...urls.filter((url) => !answer.includes(url))].filter(Boolean).join('\n')
}

function noInformationAnswer(language: string) {
  return language === 'tr'
    ? 'Bu soruya yanıt verecek doğrulanmış bir bilgi bulamadım.'
    : 'I could not find verified information that answers this question.'
}

function refusalAnswer(language: string, response?: string) {
  if (response?.trim()) return response.trim()
  return language === 'tr'
    ? 'Bu isteğe yardımcı olamam. Üniversiteyle ilgili güvenli ve doğrulanabilir konularda yardımcı olabilirim.'
    : 'I cannot help with that request. I can help with safe, verifiable questions about the institution.'
}

function addUsage(...items: Array<{ inputTokens?: number; outputTokens?: number; totalTokens?: number } | null | undefined>) {
  return items.reduce<{ inputTokens: number; outputTokens: number; totalTokens: number }>(
    (total, item) => ({
      inputTokens: total.inputTokens + (item?.inputTokens ?? 0),
      outputTokens: total.outputTokens + (item?.outputTokens ?? 0),
      totalTokens: total.totalTokens + (item?.totalTokens ?? 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 }
  )
}

export async function runLlmFirstFileSearchPipeline(input: {
  client: OpenAiFileSearchClient
  vectorStoreId: string
  retrievalModel: string
  answerModel: string
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  responseLanguage: MvpResponseLanguage
  settings?: { bot_name?: string | null; prompt?: string | null }
  citationSourcesByFilename?: Record<string, CitationSource>
  maxResults?: number
  plannerModel?: string
  plannerCreateCompletion?: LlmFirstPlannerCreateCompletion
  answerCreateCompletion?: LlmFirstEvidenceCreateCompletion
  polishCreateCompletion?: PolishCreateCompletion
}): Promise<RagProviderResult> {
  const startedAt = Date.now()
  const behaviorPolicy = compileBehaviorPolicyFromSettings(input.settings)
  const planner = await runLlmFirstTurnPlanner({
    latestUserMessage: input.latestUserMessage,
    recentMessages: input.recentMessages,
    responseLanguage: input.responseLanguage,
    behaviorPolicy,
    tenantContext: input.settings?.prompt,
    model: input.plannerModel,
    createCompletion: input.plannerCreateCompletion,
  })

  if (planner.plan.decision === 'clarify') {
    return {
      provider: 'openai_file_search_validated',
      answer: planner.plan.clarificationQuestion,
      citations: [],
      refusal: false,
      timingsMs: { total: Date.now() - startedAt },
      usage: planner.usage,
      diagnostics: {
        queryIntent: 'llm_first_clarify',
        clarification: planner.plan.clarificationQuestion,
        pendingClarification: {
          originalQuestion: input.latestUserMessage,
          clarificationQuestion: planner.plan.clarificationQuestion,
          missingSlots: planner.plan.missingInformation,
        },
      },
    }
  }

  if (planner.plan.decision === 'refuse') {
    return {
      provider: 'openai_file_search_validated',
      answer: refusalAnswer(planner.plan.responseLanguage, planner.plan.refusalResponse),
      citations: [],
      refusal: true,
      timingsMs: { total: Date.now() - startedAt },
      usage: planner.usage,
      diagnostics: { queryIntent: 'llm_first_refuse' },
    }
  }

  const retrievalStartedAt = Date.now()
  const retrieval = await runOpenAiFileSearchQuestion({
    client: input.client,
    model: input.retrievalModel,
    vectorStoreId: input.vectorStoreId,
    question: planner.plan.searchQuery,
    maxResults: input.maxResults ?? 20,
    maxOutputTokens: 160,
    instructionProfile: 'strict',
    citationSourcesByFilename: input.citationSourcesByFilename,
    extraInstructions: [
      `Resolved customer question: ${planner.plan.resolvedQuestion}`,
      `Answer goal: ${planner.plan.answerGoal}`,
      planner.plan.requiredFacts.length
        ? `Required evidence: ${planner.plan.requiredFacts.join('; ')}`
        : '',
      planner.plan.forbiddenAssumptions.length
        ? `Do not assume: ${planner.plan.forbiddenAssumptions.join('; ')}`
        : '',
      'Prefer passages and source titles directly focused on the resolved topic. Treat generic document headers or footers as weaker evidence when more specific evidence is available.',
      'Retrieve the most directly supporting passages. Keep the direct response minimal because Qualy composes the customer answer from returned evidence.',
    ]
      .filter(Boolean)
      .join(' '),
  })
  const retrievalMs = Date.now() - retrievalStartedAt
  const chunks = citationsToChunks(retrieval.citations)
  if (chunks.length === 0) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(planner.plan.responseLanguage),
      citations: [],
      refusal: true,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs },
      usage: addUsage(planner.usage, retrieval.usage),
      diagnostics: {
        queryIntent: 'llm_first_search',
        contextualQuestion: planner.plan.resolvedQuestion,
        contextualRetrievalIntent: planner.plan.searchQuery,
        strictVerdict: 'no_verified_evidence',
      },
    }
  }

  const generationStartedAt = Date.now()
  const generated = await composeLlmFirstGroundedAnswer({
    resolvedQuestion: planner.plan.resolvedQuestion,
    answerGoal: planner.plan.answerGoal,
    requiredFacts: planner.plan.requiredFacts,
    forbiddenAssumptions: planner.plan.forbiddenAssumptions,
    responseLanguage: input.responseLanguage,
    chunks,
    settings: input.settings,
    model: input.answerModel,
    createCompletion: input.answerCreateCompletion,
  })
  const generationMs = Date.now() - generationStartedAt
  const grounded = generated?.answer.trim() ?? ''
  if (!generated || !grounded) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(planner.plan.responseLanguage),
      citations: [],
      refusal: true,
      timingsMs: {
        total: Date.now() - startedAt,
        retrieval: retrievalMs,
        generation: generationMs,
      },
      usage: addUsage(planner.usage, retrieval.usage, generated?.usage),
      diagnostics: {
        queryIntent: 'llm_first_search',
        contextualQuestion: planner.plan.resolvedQuestion,
        strictVerdict: 'grounded_generation_rejected',
      },
    }
  }

  const citations = selectedCitations(retrieval.citations, generated.sourceChunks)
  const polished = await polishGroundedRagAnswer({
    answer: grounded,
    userMessage: planner.plan.resolvedQuestion,
    responseLanguage: input.responseLanguage,
    chunks: generated.sourceChunks,
    settings: input.settings,
    model: input.answerModel,
    createCompletion: input.polishCreateCompletion,
  })
  const polishedAnswer = polished.answer.trim()
  const usePolish = Boolean(
    polished.usedPolish &&
      !polished.addedEngagement &&
      polishedAnswer &&
      polishPreservesFacts(grounded, polishedAnswer)
  )
  const answer = appendCitationUrls(usePolish ? polishedAnswer : grounded, citations)

  return {
    provider: 'openai_file_search_validated',
    answer,
    citations,
    refusal: false,
    timingsMs: {
      total: Date.now() - startedAt,
      retrieval: retrievalMs,
      generation: generationMs,
    },
    usage: addUsage(planner.usage, retrieval.usage, generated.usage, polished.usage),
    diagnostics: {
      queryIntent: 'llm_first_search',
      contextualQuestion: planner.plan.resolvedQuestion,
      contextualRetrievalIntent: planner.plan.searchQuery,
      contextualReason: planner.plan.answerGoal,
      presentationPolish: {
        usedPolish: usePolish,
        addedEngagement: usePolish ? polished.addedEngagement : false,
        model: polished.model,
      },
      strictVerdict: 'verified_evidence_answer',
    },
  }
}
