import { compileBehaviorPolicyFromSettings } from '@/lib/ai/behavior-policy'
import type { MvpResponseLanguage } from '@/lib/ai/language'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagChunk } from '@/lib/knowledge-base/rag'
import {
  runOpenAiFileSearchQuestion,
  type OpenAiFileSearchClient,
  type OpenAiFileSearchFilter,
} from '@/lib/knowledge-base/rag-eval/openai-file-search'
import type {
  RagProviderCitation,
  RagProviderResult,
} from '@/lib/knowledge-base/rag-eval/types'

import {
  composeLlmFirstGroundedAnswer,
  type LlmFirstEvidenceCreateCompletion,
  type LlmFirstGroundedAnswer,
} from './evidence'
import {
  runLlmFirstTurnPlanner,
  type LlmFirstPlannerCreateCompletion,
} from './planner'
import { composeLlmFirstTableFactAnswer } from './table-facts'
import type { LlmFirstSearchPlan } from './contracts'

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

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function uniqueText(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values.map(compactWhitespace).filter(Boolean)) {
    const key = value.toLocaleLowerCase('tr')
    if (seen.has(key)) continue
    seen.add(key)
    result.push(value)
  }
  return result
}

const STRUCTURED_QUERY_STOPWORDS = new Set([
  'acaba',
  'adi',
  'adli',
  'bilgisi',
  'bolum',
  'bolumu',
  'fakulte',
  'fakultesi',
  'fiyat',
  'fiyati',
  'egitim',
  'icin',
  'ihtisas',
  'kac',
  'kisi',
  'kontenjan',
  'kontenjani',
  'nedir',
  'program',
  'programi',
  'programinin',
  'soyle',
  'sure',
  'suresi',
  'tablo',
  'tl',
  'universite',
  'universitesi',
  'ucret',
  'ucreti',
  'ucretler',
  'ucretleri',
  'var',
  'years',
  'yil',
  'yillik',
  'yuksek',
])

const TURKISH_CHAR_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ş: 's',
  Ş: 's',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
}

function normalizeSearchTerm(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

function structuredSubjectQuery(plan: LlmFirstSearchPlan) {
  const text = [
    plan.resolvedQuestion,
    plan.searchQuery,
    ...plan.searchQueries,
  ].join(' ')
  return uniqueText(
    normalizeSearchTerm(text)
      .split(/[^a-z0-9]+/i)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
      .filter((token) => !/^\d+$/.test(token))
      .filter((token) => !STRUCTURED_QUERY_STOPWORDS.has(token))
  )
    .slice(0, 5)
    .join(' ')
}

function searchPlanText(plan: LlmFirstSearchPlan, latestUserMessage = '') {
  return [
    latestUserMessage,
    plan.resolvedQuestion,
    plan.searchQuery,
    ...plan.searchQueries,
    plan.answerGoal,
    ...plan.requiredFacts,
  ].join(' ').toLocaleLowerCase('tr')
}

function tabularMetricSearchHints(plan: LlmFirstSearchPlan, latestUserMessage = '') {
  const text = normalizeSearchTerm(searchPlanText(plan, latestUserMessage))
  const hints: string[] = []

  if (/(?:^|[^a-z0-9])(fiyat|ucret|kac para|ne kadar|tl)(?:[^a-z0-9]|$)/.test(text)) {
    hints.push('2025 Fiyat Bölüm Adı Program Adı 2025 Kontenjanı')
  }
  if (/(?:^|[^a-z0-9])(kontenjan|kac kisi|ogrenci sayisi)(?:[^a-z0-9]|$)/.test(text)) {
    hints.push('2025 Kontenjanı Bölüm Adı Program Adı 2025 Fiyat')
  }
  if (/(?:^|[^a-z0-9])(basari sirasi|siralama)(?:[^a-z0-9]|$)/.test(text)) {
    hints.push('2024 Başarı Sırası Bölüm Adı Program Adı 2024 Taban Puanı')
  }
  if (/(?:^|[^a-z0-9])(taban puan|taban puani)(?:[^a-z0-9]|$)/.test(text)) {
    hints.push('2024 Taban Puanı Bölüm Adı Program Adı 2024 Başarı Sırası')
  }
  if (/(?:^|[^a-z0-9])(puan turu|sayisal|tyt|ea)(?:[^a-z0-9]|$)/.test(text)) {
    hints.push('Puan Türü Bölüm Adı Program Adı SAY EA TYT')
  }
  if (/(?:^|[^a-z0-9])(program kodu|puan kodu)(?:[^a-z0-9]|$)/.test(text)) {
    hints.push('Puan Kodu Bölüm Adı Program Adı')
  }

  return hints
}

function hasDurationMetric(plan: LlmFirstSearchPlan, latestUserMessage = '') {
  const text = normalizeSearchTerm(searchPlanText(plan, latestUserMessage))
  return /(?:^|[^a-z0-9])(egitim suresi|kac yil|kac yillik|years)(?:[^a-z0-9]|$)/.test(text)
}

function tableSearchHints(plan: LlmFirstSearchPlan, latestUserMessage = '') {
  const hints = tabularMetricSearchHints(plan, latestUserMessage)

  if (hasDurationMetric(plan, latestUserMessage)) {
    hints.push('EĞİTİM PROGRAMI PROGRAM ADI EĞİTİM SÜRESİ Education Time yıl years')
  }

  return hints
}

function sourceGroupFilterForGroups(sourceGroups: string[]): OpenAiFileSearchFilter | undefined {
  const groups = uniqueText(sourceGroups)
  if (groups.length === 0) return undefined
  return {
    type: 'in',
    key: 'source_group',
    value: groups,
  }
}

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

function mergeCitations(results: RagProviderResult[]) {
  const seen = new Set<string>()
  const citations: RagProviderCitation[] = []

  for (const result of results) {
    for (const citation of result.citations) {
      const quote = compactWhitespace(citation.quote ?? '')
      if (!quote) continue
      const key = [citation.providerSourceId, quote.slice(0, 1000)].join('|')
      if (seen.has(key)) continue
      seen.add(key)
      citations.push(citation)
    }
  }

  return citations
}

function mergeRetrievalResults(results: RagProviderResult[]): RagProviderResult {
  const [first] = results
  if (!first) throw new Error('Expected at least one retrieval result')

  return {
    ...first,
    answer: results.map((result) => result.answer).filter(Boolean).join('\n'),
    citations: mergeCitations(results),
    refusal: results.every((result) => result.refusal),
    timingsMs: {
      total: results.reduce((total, result) => total + (result.timingsMs.total ?? 0), 0),
    },
    usage: addUsage(...results.map((result) => result.usage)),
  }
}

function expandedSearchQuestion(plan: LlmFirstSearchPlan, latestUserMessage = '') {
  const tableHints = tableSearchHints(plan, latestUserMessage)
  const structuredSubject = structuredSubjectQuery(plan)
  const queries = uniqueText([
    tableHints.length ? `${structuredSubject || plan.searchQuery} ${tableHints.join(' ')}` : '',
    ...plan.searchQueries,
    ...tableHints,
    plan.resolvedQuestion,
    plan.answerGoal,
    ...plan.requiredFacts,
  ]).filter(
    (query) => query.toLocaleLowerCase('tr') !== plan.searchQuery.toLocaleLowerCase('tr')
  )

  if (queries.length === 0) return ''
  return queries.slice(0, 6).join('\n')
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

function retrievalExtraInstructions(plan: LlmFirstSearchPlan, stage: 'primary' | 'expanded') {
  return [
    `Resolved customer question: ${plan.resolvedQuestion}`,
    `Answer goal: ${plan.answerGoal}`,
    plan.requiredFacts.length
      ? `Required evidence: ${plan.requiredFacts.join('; ')}`
      : '',
    plan.forbiddenAssumptions.length
      ? `Do not assume: ${plan.forbiddenAssumptions.join('; ')}`
      : '',
    stage === 'expanded'
      ? 'This is a recall retry. Search for semantically equivalent wording, literal user phrasing, table labels, headings, and nearby policy sections before concluding there is no evidence.'
      : '',
    'Prefer passages and source titles directly focused on the resolved topic. Treat generic document headers or footers as weaker evidence when more specific evidence is available.',
    'Retrieve the most directly supporting passages. Keep the direct response minimal because Qualy composes the customer answer from returned evidence.',
  ]
    .filter(Boolean)
    .join(' ')
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
  sourceGroupScopes?: {
    tableFacts?: string[]
    durationFacts?: string[]
  }
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

  const searchPlan = planner.plan
  let retrievalMs = 0
  let generationMs = 0
  let retryCount = 0
  let usedTableFactAnswer = false
  const tabularMetricHints = tabularMetricSearchHints(searchPlan, input.latestUserMessage)
  const tableFactFilter =
    tabularMetricHints.length > 0
      ? sourceGroupFilterForGroups(input.sourceGroupScopes?.tableFacts ?? [])
      : undefined
  const durationFactFilter =
    !tableFactFilter && hasDurationMetric(searchPlan, input.latestUserMessage)
      ? sourceGroupFilterForGroups(input.sourceGroupScopes?.durationFacts ?? [])
      : undefined
  const retrievalFilter = tableFactFilter ?? durationFactFilter

  const runRetrieval = async (question: string, stage: 'primary' | 'expanded') => {
    const attemptStartedAt = Date.now()
    const result = await runOpenAiFileSearchQuestion({
      client: input.client,
      model: input.retrievalModel,
      vectorStoreId: input.vectorStoreId,
      question,
      maxResults: stage === 'expanded' ? Math.max(input.maxResults ?? 20, 24) : input.maxResults ?? 20,
      maxOutputTokens: stage === 'expanded' ? 220 : 160,
      instructionProfile: 'strict',
      citationSourcesByFilename: input.citationSourcesByFilename,
      filters: retrievalFilter,
      extraInstructions: retrievalExtraInstructions(searchPlan, stage),
    })
    retrievalMs += Date.now() - attemptStartedAt
    return result
  }

  const generateFromChunks = async (
    chunks: RagChunk[]
  ): Promise<LlmFirstGroundedAnswer | null> => {
    if (chunks.length === 0) return null
    const attemptStartedAt = Date.now()
    const tableFactAnswer = composeLlmFirstTableFactAnswer({
      resolvedQuestion: searchPlan.resolvedQuestion,
      answerGoal: searchPlan.answerGoal,
      responseLanguage: input.responseLanguage,
      chunks,
    })
    if (tableFactAnswer) {
      generationMs += Date.now() - attemptStartedAt
      usedTableFactAnswer = true
      return tableFactAnswer
    }

    const answer = await composeLlmFirstGroundedAnswer({
      resolvedQuestion: searchPlan.resolvedQuestion,
      answerGoal: searchPlan.answerGoal,
      requiredFacts: searchPlan.requiredFacts,
      forbiddenAssumptions: searchPlan.forbiddenAssumptions,
      responseLanguage: input.responseLanguage,
      chunks,
      settings: input.settings,
      model: input.answerModel,
      createCompletion: input.answerCreateCompletion,
    })
    generationMs += Date.now() - attemptStartedAt
    return answer
  }

  const retrievalAttempts: RagProviderResult[] = [
    await runRetrieval(searchPlan.searchQuery, 'primary'),
  ]
  let retrieval = mergeRetrievalResults(retrievalAttempts)
  let chunks = citationsToChunks(retrieval.citations)
  let generated = await generateFromChunks(chunks)
  const retryQuery = expandedSearchQuestion(searchPlan, input.latestUserMessage)

  if (!generated && retryQuery) {
    retryCount = 1
    retrievalAttempts.push(await runRetrieval(retryQuery, 'expanded'))
    retrieval = mergeRetrievalResults(retrievalAttempts)
    chunks = citationsToChunks(retrieval.citations)
    usedTableFactAnswer = false
    generated = await generateFromChunks(chunks)
  }

  if (chunks.length === 0) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(searchPlan.responseLanguage),
      citations: [],
      refusal: true,
      timingsMs: { total: Date.now() - startedAt, retrieval: retrievalMs },
      usage: addUsage(planner.usage, retrieval.usage),
      diagnostics: {
        queryIntent: 'llm_first_search',
        contextualQuestion: searchPlan.resolvedQuestion,
        contextualRetrievalIntent: searchPlan.searchQuery,
        retryCount,
        evidenceRetry: {
          attempted: retryCount > 0,
          outcome: 'no_evidence',
          query: retryQuery || undefined,
        },
        strictVerdict: 'no_verified_evidence',
      },
    }
  }

  const grounded = generated?.answer.trim() ?? ''
  if (!generated || !grounded) {
    return {
      provider: 'openai_file_search_validated',
      answer: noInformationAnswer(searchPlan.responseLanguage),
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
        contextualQuestion: searchPlan.resolvedQuestion,
        contextualRetrievalIntent: searchPlan.searchQuery,
        retryCount,
        evidenceRetry: {
          attempted: retryCount > 0,
          outcome: 'no_supported_answer',
          query: retryQuery || undefined,
        },
        strictVerdict: 'grounded_generation_rejected',
      },
    }
  }

  const citations = selectedCitations(retrieval.citations, generated.sourceChunks)
  const polished = await polishGroundedRagAnswer({
    answer: grounded,
    userMessage: searchPlan.resolvedQuestion,
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
      contextualQuestion: searchPlan.resolvedQuestion,
      contextualRetrievalIntent: searchPlan.searchQuery,
      contextualReason: searchPlan.answerGoal,
      retryCount,
      evidenceRetry: {
        attempted: retryCount > 0,
        outcome: 'passed',
        query: retryCount > 0 ? retryQuery : undefined,
      },
      presentationPolish: {
        usedPolish: usePolish,
        addedEngagement: usePolish ? polished.addedEngagement : false,
        model: polished.model,
      },
      strictVerdict: usedTableFactAnswer
        ? 'verified_table_fact_answer'
        : 'verified_evidence_answer',
    },
  }
}
