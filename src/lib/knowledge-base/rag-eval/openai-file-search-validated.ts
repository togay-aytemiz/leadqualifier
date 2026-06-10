import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import { resolveMvpResponseLanguage } from '@/lib/ai/language'
import { buildClarificationGateResult } from '@/lib/knowledge-base/rag-clarification'
import { generateGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-generate'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagChunk } from '@/lib/knowledge-base/rag'
import { buildRagEvidencePack } from '@/lib/knowledge-base/evidence-pack'
import {
  type OpenAiFileSearchClient,
  type OpenAiFileSearchFilter,
  type OpenAiFileSearchInstructionProfile,
  runOpenAiFileSearchQuestion,
} from './openai-file-search'
import { planBrochureQuery, type BrochureQueryPlan } from './brochure-query-plan'
import { resolveBrochureTableFact } from './brochure-table'
import { resolveApprovedSourceFact } from './approved-source-facts'
import { buildValidatedFollowup } from './validated-followup'
import type { RagProviderCitation, RagProviderResult } from './types'
import { understandStrictQuestion } from './strict-question-understanding'
import { resolveStrictCatalogAnswer, type StrictCatalogAnswer } from './strict-fact-catalog'
import {
  evaluateStrictAnswer,
  strictSafetyAnswer,
  type StrictAnswerCriticVerdict,
} from './strict-answer-critic'
import { buildStrictClaimLedger, summarizeStrictClaimLedger } from './strict-claim-ledger'
import {
  buildStrictResearchPlan,
  summarizeStrictResearchPlan,
  type StrictResearchPlan,
  type StrictResearchPlanDiagnostics,
} from './strict-research-plan'
import { classifyStrictQuestionFacets } from './strict-answer-contract'
import { buildStrictEvidenceRetryPlan, type StrictEvidenceRetryPlan } from './strict-evidence-retry'
import {
  evaluateAnswerWithStrictLlm,
  type StrictLlmCreateCompletion,
  type StrictLlmEvaluatorResult,
} from './strict-llm-evaluator'
import {
  runStrictLlmResearchPlanner,
  type StrictLlmResearchPlanResult,
  type StrictLlmResearchPlannerCreateCompletion,
} from './strict-llm-research-planner'
import { classifyStrictDirectAnswerQuality } from './strict-quality-rubric'

type CitationSource = {
  title?: string
  url?: string
}

type CreateCompletionOptions = {
  signal?: AbortSignal
}

type CreateCompletion = (
  args: Record<string, unknown>,
  options?: CreateCompletionOptions
) => Promise<{
  choices?: Array<{
    message?: {
      content?: string | null
    } | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}>

type StrictResearchBlackboardAttempt = {
  stage: string
  query: string
  sourceGroups: string[]
  citationCount: number
  outcome?: string
  reason?: string
}

type StrictResearchBlackboard = {
  facets: string[]
  attempts: StrictResearchBlackboardAttempt[]
  finalVerdict?: string
}

export type OpenAiFileSearchValidatedQuestionInput = {
  client: OpenAiFileSearchClient
  model: string
  answerModel?: string
  vectorStoreId: string
  question: string
  maxResults?: number
  maxOutputTokens?: number
  instructionProfile?: OpenAiFileSearchInstructionProfile
  citationSourcesByFilename?: Record<string, CitationSource>
  createCompletion?: CreateCompletion
  settings?: {
    bot_name?: string | null
    prompt?: string | null
  }
  qualityMode?: 'validated' | 'strict'
  enableStrictLlmEvaluator?: boolean
  strictEvaluatorModel?: string
  strictEvaluatorCreateCompletion?: StrictLlmCreateCompletion
  conversationHistory?: KnowledgeSearchPlanningTurn[]
  contextualOrchestratorModel?: string
  contextualOrchestratorCreateCompletion?: CreateCompletion
  sourcePriorityGroups?: string[]
  enableLlmResearchPlanner?: boolean
  researchPlannerModel?: string
  researchPlannerCreateCompletion?: StrictLlmResearchPlannerCreateCompletion
}

const NO_CLEAR_INFORMATION_ANSWER = 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.'
const DEFAULT_CONTEXTUAL_ORCHESTRATOR_MODEL = 'gpt-4o-mini'
const CONTEXTUAL_ORCHESTRATOR_MAX_OUTPUT_TOKENS = 260
const MAX_CONTEXTUAL_HISTORY_TURNS = 10

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

function normalizeForSupport(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function compactDigits(value: string) {
  return value.replace(/\D/g, '')
}

function cleanAnswer(answer: string) {
  return answer
    .replace(/【[^】]+】/g, '')
    .replace(/\s+\./g, '.')
    .replace(/\s+/g, ' ')
    .trim()
}

function citationText(citations: RagProviderCitation[]) {
  return citations
    .map((citation) => [citation.title, citation.url, citation.quote].filter(Boolean).join('\n'))
    .join('\n\n')
}

function extractEmails(value: string) {
  return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
}

function extractPhones(value: string) {
  return value.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? []
}

function extractNumbers(value: string) {
  return value.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? []
}

function extractDurations(value: string) {
  return (
    value.match(
      /(?<![\p{L}\p{N}_])\d+\s*(?:iş\s*)?(?:gün(?:ü)?|hafta|ay|yıl|saat|dakika)(?=(?:dür|dur)?(?![\p{L}\p{N}_]))/giu
    ) ?? []
  )
}

function extractDocumentCodes(value: string) {
  return (
    value.match(/\p{Lu}{2,12}(?:\.\p{Lu}{2,12}){0,2}\.\d{3,4}|\p{Lu}{2,12}YNG\.\d{3,4}/gu) ?? []
  )
}

function extractPlatforms(value: string) {
  return (
    value.match(
      /(?<![\p{L}\p{N}_])(?:MEDU|UZEM|ÖBS|OBS|LMS|Moodle|Teams|Zoom)(?![\p{L}\p{N}_])/giu
    ) ?? []
  )
}

function criticalSupportValues(answer: string) {
  return Array.from(
    new Set([
      ...extractEmails(answer),
      ...extractPhones(answer),
      ...extractDocumentCodes(answer),
      ...extractNumbers(answer),
      ...extractDurations(answer),
      ...extractPlatforms(answer),
    ])
  )
}

function citationSupportsValue(citation: RagProviderCitation, value: string) {
  const text = [citation.title, citation.url, citation.quote].filter(Boolean).join('\n')
  const normalizedText = normalizeForSupport(text)
  const normalizedValue = normalizeForSupport(value)
  const valueDigits = compactDigits(value)
  if (normalizedValue && normalizedText.includes(normalizedValue)) return true
  return Boolean(
    valueDigits && valueDigits.length >= 2 && compactDigits(text).includes(valueDigits)
  )
}

function supportingCitationsForAnswer(answer: string, citations: RagProviderCitation[]) {
  const values = criticalSupportValues(answer)
  if (values.length === 0) return citations.slice(0, 3)

  const supporting = citations.filter((citation) =>
    values.some((value) => citationSupportsValue(citation, value))
  )
  return (supporting.length > 0 ? supporting : citations).slice(0, 3)
}

function hasCriticalValueSupport(answer: string, citations: RagProviderCitation[]) {
  const support = citationText(citations)
  const normalizedSupport = normalizeForSupport(support)
  const supportDigits = compactDigits(support)

  for (const email of extractEmails(answer)) {
    if (!normalizedSupport.includes(normalizeForSupport(email))) return false
  }

  for (const phone of extractPhones(answer)) {
    const digits = compactDigits(phone)
    if (digits.length >= 8 && !supportDigits.includes(digits)) return false
  }

  for (const code of extractDocumentCodes(answer)) {
    if (!normalizedSupport.includes(normalizeForSupport(code))) return false
  }

  for (const number of [...extractNumbers(answer), ...extractDurations(answer)]) {
    const normalizedNumber = normalizeForSupport(number)
    const digits = compactDigits(number)
    if (!digits) continue
    if (!normalizedSupport.includes(normalizedNumber) && !supportDigits.includes(digits))
      return false
  }

  for (const platform of extractPlatforms(answer)) {
    if (!normalizedSupport.includes(normalizeForSupport(platform))) return false
  }

  return true
}

function rawAnswerLooksLikeRefusal(answer: string) {
  const normalizedAnswer = normalizeForSupport(answer)
  return (
    /net(?: bir)? [^.]{0,100}(?:bilgi|ucret|tutar|gun|sure)[^.]{0,100}(?:bulunmamaktadir|verilmemistir|yer almamaktadir|belirtilmemistir)/.test(
      normalizedAnswer
    ) ||
    /(?:acikca|dogrudan)[^.]{0,100}(?:belirtilmemistir|yer almamaktadir)/.test(normalizedAnswer)
  )
}

function rawAnswerLooksLikeProviderPlaceholder(answer: string) {
  const normalizedAnswer = normalizeForSupport(answer)
  return /^(?:retrieval complete|search complete|file search complete|retrieved results?|arama tamamlandi)$/i.test(
    normalizedAnswer
  )
}

function llmRepairLooksSpeculativeUnsupported(answer: string) {
  const normalizedAnswer = normalizeForSupport(answer)
  if (rawAnswerLooksLikeRefusal(answer)) return false
  return /(?:genellikle|muhtemelen|tahminen|olabilir|olasi|olasilikla)/.test(normalizedAnswer)
}

function isUnitSpecificContactQuestion(question: string) {
  const normalizedQuestion = normalizeForSupport(question)
  return (
    /(?:e-posta|eposta|email|telefon|numara)/.test(normalizedQuestion) &&
    !/(?:universitenin|universite genel|rektorlu[ğg]un|genel telefon|genel e-posta)/.test(
      normalizedQuestion
    )
  )
}

function hasGenericInstitutionFooterContact(answer: string, citations: RagProviderCitation[]) {
  const answerEmails = new Set(extractEmails(answer).map((email) => normalizeForSupport(email)))
  const answerPhones = extractPhones(answer)
    .map((phone) => compactDigits(phone))
    .filter(Boolean)
  if (answerEmails.size === 0 && answerPhones.length === 0) return false

  return citations.some((citation) => {
    const quote = citation.quote ?? ''
    const normalizedQuote = normalizeForSupport(quote)
    const quoteDigits = compactDigits(quote)
    const footerLike =
      /adres\s*:\s*yuksek ihtisas universitesi rektorlugu/.test(normalizedQuote) ||
      /internet adresi\s*:/.test(normalizedQuote) ||
      /sayfa\s*\d+\s*\/\s*\d+/.test(normalizedQuote)
    if (!footerLike) return false

    const hasEmail = Array.from(answerEmails).some((email) => normalizedQuote.includes(email))
    const hasPhone = answerPhones.some((phone) => phone.length >= 8 && quoteDigits.includes(phone))
    return hasEmail || hasPhone
  })
}

function isCourseMaterialPlatformQuestion(question: string) {
  return /(?:ders\s+not|notlar|materyal|i[çc]erik)/i.test(normalizeForSupport(question))
}

function hasCourseMaterialPlatformSupport(citations: RagProviderCitation[]) {
  const support = normalizeForSupport(citationText(citations))
  return /(?:ders\s+not|notlar|ders\s+materyal|ders\s+i[çc]erik|materyal)/.test(support)
}

function isRawAnswerSupported(input: {
  question: string
  answer: string
  citations: RagProviderCitation[]
}) {
  if (!input.answer.trim() || input.citations.length === 0) return false
  if (rawAnswerLooksLikeProviderPlaceholder(input.answer)) return false
  if (/https?:\/\//i.test(input.answer)) return false
  if (/\bno_answer\b/i.test(input.answer)) return false
  if (!hasCriticalValueSupport(input.answer, input.citations)) return false
  if (
    isUnitSpecificContactQuestion(input.question) &&
    hasGenericInstitutionFooterContact(input.answer, input.citations)
  ) {
    return false
  }
  if (
    isCourseMaterialPlatformQuestion(input.question) &&
    !hasCourseMaterialPlatformSupport(input.citations)
  ) {
    return false
  }
  return true
}

function citationsToChunks(citations: RagProviderCitation[]): RagChunk[] {
  return citations
    .filter((citation) => citation.quote?.trim())
    .map((citation) => ({
      content: citation.quote?.trim() ?? '',
      similarity: citation.score,
      document_id: citation.providerSourceId,
      document_title: citation.title,
      chunk_id: citation.providerSourceId,
      source_url: citation.url ?? null,
    }))
}

function citationMatchesChunk(citation: RagProviderCitation, chunk: RagChunk) {
  const chunkSourceUrl = chunk.source_url ?? chunk.sourceUrl ?? null
  if (chunk.chunk_id && citation.providerSourceId === chunk.chunk_id) return true
  if (chunkSourceUrl && citation.url === chunkSourceUrl) return true
  return Boolean(chunk.document_title && citation.title === chunk.document_title)
}

function selectedCitations(citations: RagProviderCitation[], chunks: RagChunk[] | undefined) {
  if (!chunks || chunks.length === 0) return []
  return citations.filter((citation) =>
    chunks.some((chunk) => citationMatchesChunk(citation, chunk))
  )
}

function appendSourceUrls(answer: string, citations: RagProviderCitation[]) {
  const urls = Array.from(
    new Set(
      citations.map((citation) => citation.url?.trim()).filter((url): url is string => Boolean(url))
    )
  )
  if (urls.length === 0) return answer.trim()
  return [answer.trim(), ...urls].join('\n')
}

function combinedUsage(
  retrieval: RagProviderResult['usage'],
  generation: NonNullable<Awaited<ReturnType<typeof generateGroundedRagAnswer>>['usage']> | null
): RagProviderResult['usage'] {
  const inputTokens = (retrieval.inputTokens ?? 0) + (generation?.inputTokens ?? 0)
  const outputTokens = (retrieval.outputTokens ?? 0) + (generation?.outputTokens ?? 0)
  const totalTokens = (retrieval.totalTokens ?? 0) + (generation?.totalTokens ?? 0)
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    toolCalls: retrieval.toolCalls,
    estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
  }
}

function usageWithExtra(
  base: RagProviderResult['usage'],
  extra: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    toolCalls?: number
  } | null
): RagProviderResult['usage'] {
  if (!extra) return base
  const inputTokens = (base.inputTokens ?? 0) + (extra.inputTokens ?? 0)
  const outputTokens = (base.outputTokens ?? 0) + (extra.outputTokens ?? 0)
  const totalTokens = (base.totalTokens ?? 0) + (extra.totalTokens ?? 0)
  return {
    ...base,
    inputTokens,
    outputTokens,
    totalTokens,
    toolCalls: (base.toolCalls ?? 0) + (extra.toolCalls ?? 0),
    estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
  }
}

function combinedRetrievalUsage(attempts: RagProviderResult[]): RagProviderResult['usage'] {
  return {
    inputTokens: attempts.reduce((sum, attempt) => sum + (attempt.usage.inputTokens ?? 0), 0),
    outputTokens: attempts.reduce((sum, attempt) => sum + (attempt.usage.outputTokens ?? 0), 0),
    totalTokens: attempts.reduce((sum, attempt) => sum + (attempt.usage.totalTokens ?? 0), 0),
    toolCalls: attempts.reduce((sum, attempt) => sum + (attempt.usage.toolCalls ?? 0), 0),
    estimatedCredits: attempts.reduce(
      (sum, attempt) => sum + (attempt.usage.estimatedCredits ?? 0),
      0
    ),
  }
}

function retrievalWithCombinedUsage(
  selected: RagProviderResult,
  attempts: RagProviderResult[]
): RagProviderResult {
  return {
    ...selected,
    citations: dedupeProviderCitations(attempts.flatMap((attempt) => attempt.citations)),
    usage: combinedRetrievalUsage(attempts),
    timingsMs: {
      ...selected.timingsMs,
      total: attempts.reduce((sum, attempt) => sum + attempt.timingsMs.total, 0),
    },
  }
}

function uniqueSourceGroups(sourceGroups: string[] | undefined) {
  return Array.from(new Set((sourceGroups ?? []).map((group) => group.trim()).filter(Boolean)))
}

function sourceGroupFilterForGroups(sourceGroups: string[]): OpenAiFileSearchFilter | undefined {
  if (sourceGroups.length === 0) return undefined
  return {
    type: 'in',
    key: 'source_group',
    value: sourceGroups,
  }
}

function sourceGroupFilter(plan: BrochureQueryPlan): OpenAiFileSearchFilter | undefined {
  return sourceGroupFilterForGroups(plan.sourceGroups)
}

function dedupeProviderCitations(citations: RagProviderCitation[]) {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = [
      citation.providerSourceId,
      citation.title,
      citation.url,
      citation.quote,
    ]
      .filter(Boolean)
      .join('|')
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function isExactBrochureTablePlan(plan: BrochureQueryPlan) {
  return plan.intent === 'brochure_table_fact'
}

function retrievalAttemptKey(query: string, sourceGroups: string[]) {
  return `${normalizeForSupport(query)}|${sourceGroups.join(',')}`
}

function hasAnyCitation(attempts: RagProviderResult[]) {
  return attempts.some((attempt) => attempt.citations.length > 0)
}

function approvedSourceRetryQuery(question: string, plan: BrochureQueryPlan) {
  const normalizedQuestion = normalizeForSupport(question)
  if (plan.intent === 'website_contact') {
    if (/(?:rektor|tip fakultesi)/.test(normalizedQuestion)) {
      return [
        'Rektörlük ve Tıp Fakültesi',
        'İşçi Blokları Yerleşkesi',
        '1505. Cd. No: 18/A',
        '+90 312 329 10 10',
        'yiu@yiu.edu.tr',
      ].join(' | ')
    }
    return 'Öğrenci İşleri Daire Başkanlığı | öğrenci işleri e-posta | telefon'
  }
  if (plan.intent === 'website_admissions') {
    return plan.retryQuery
  }
  if (
    plan.intent === 'general_approved_corpus' &&
    /bilgi paketi/.test(normalizedQuestion) &&
    /saglik hizmetleri meslek yuksekokulu/.test(normalizedQuestion)
  ) {
    return [
      'Sağlık Hizmetleri Meslek Yüksekokulu bilgi paketi program listesi',
      'Anestezi Programı',
      'İlk ve Acil Yardım',
      'Optisyenlik Programı',
      'Tele-Sağlık Teknikerliği',
    ].join(' | ')
  }
  return undefined
}

function normalizeSignal(value: string) {
  return normalizeForSupport(value)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

const DOCUMENT_ROUTER_STOPWORDS = new Set([
  'adi',
  'almak',
  'anlatiliyor',
  'bakilir',
  'bakmak',
  'belge',
  'belgede',
  'dosya',
  'dosyada',
  'dokuman',
  'dokumanda',
  'icin',
  'hangisi',
  'hangi',
  'hakkinda',
  'istiyorum',
  'kaynak',
  'mevzuat',
  'nedir',
  'nereden',
  'ogrenebilirim',
  'ogrenci',
  'ogrenciyi',
  'program',
  'programi',
  'programlari',
  'kurallari',
  'yonerge',
  'yonergesi',
  'yonetmelik',
  'yonetmeligi',
])

const DOCUMENT_TITLE_HINTS: Array<{ question: RegExp; titleFragment: string }> = [
  { question: /\berasmus\b/, titleFragment: 'erasmus' },
  {
    question: /(?:bolum danisman|danismanimin|akademik danisman)/,
    titleFragment: 'akademik danismanlik',
  },
  { question: /ozel ogrenci/, titleFragment: 'ozel ogrenci' },
]

function termsOverlap(left: string, right: string) {
  if (left === right) return true
  if (left.length < 6 || right.length < 6) return false
  return left.startsWith(right.slice(0, 6)) || right.startsWith(left.slice(0, 6))
}

function documentRouterCitations(question: string, citations: RagProviderCitation[]) {
  const normalizedQuestion = normalizeForSupport(question)
  const titleHint = DOCUMENT_TITLE_HINTS.find(({ question: pattern }) =>
    pattern.test(normalizedQuestion)
  )?.titleFragment
  if (titleHint) {
    const hinted = citations
      .filter((citation) => normalizeForSupport(citation.title ?? '').includes(titleHint))
      .sort((a, b) => (a.title?.length ?? 0) - (b.title?.length ?? 0))
    if (hinted.length > 0) return hinted.slice(0, 1)
  }

  const questionTerms = new Set(
    normalizeSignal(question)
      .split(' ')
      .filter((term) => term.length >= 3 && !DOCUMENT_ROUTER_STOPWORDS.has(term))
  )
  if (questionTerms.size === 0) return []

  const ranked = citations
    .filter((citation) => citation.title?.trim())
    .map((citation) => {
      const titleTerms = new Set(normalizeSignal(citation.title ?? '').split(' '))
      const overlap = Array.from(questionTerms).filter((questionTerm) =>
        Array.from(titleTerms).some((titleTerm) => termsOverlap(questionTerm, titleTerm))
      ).length
      return { citation, overlap }
    })
    .filter(({ overlap }) => overlap > 0)
    .sort(
      (a, b) =>
        b.overlap - a.overlap ||
        (a.citation.title?.length ?? 0) - (b.citation.title?.length ?? 0) ||
        (b.citation.score ?? 0) - (a.citation.score ?? 0)
    )
  const best = ranked[0]
  if (!best) return []
  if (normalizedQuestion.includes('bidb')) {
    return ranked
      .filter(({ citation }) => normalizeForSupport(citation.title ?? '').includes('bidb'))
      .slice(0, 3)
      .map(({ citation }) => citation)
  }
  return ranked
    .filter(({ overlap }) => overlap >= Math.max(1, best.overlap - 1))
    .slice(0, 1)
    .map(({ citation }) => citation)
}

function catalogCitations(
  citationSourcesByFilename: Record<string, CitationSource> | undefined
): RagProviderCitation[] {
  return Object.entries(citationSourcesByFilename ?? {}).flatMap(([filename, source]) => {
    if (!source.title?.trim()) return []
    return [
      {
        providerSourceId: filename,
        title: source.title,
        url: source.url,
        quote: source.title,
      },
    ]
  })
}

function dedupeCitationsByTitle(citations: RagProviderCitation[]) {
  const seen = new Set<string>()
  return citations.filter((citation) => {
    const key = normalizeForSupport(citation.title ?? citation.providerSourceId)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

function documentRouterAnswer(question: string, citations: RagProviderCitation[]) {
  const titles = citations
    .map((citation) => citation.title?.trim())
    .filter((title): title is string => Boolean(title))
  if (normalizeForSupport(question).includes('bidb')) {
    return `BİDB, Bilgi İşlem Daire Başkanlığı'nı ifade eder. İlgili yönergeler: ${titles.join('; ')}.`
  }
  return `İlgili belge: ${titles[0]}.`
}

function directValidatedResult(input: {
  startedAt: number
  retrieval: RagProviderResult
  retrievalMs: number
  question: string
  plan: BrochureQueryPlan
  retryCount: number
  answer: string
  citations: RagProviderCitation[]
}): RagProviderResult {
  const followup = buildValidatedFollowup({
    question: input.question,
    answer: input.answer,
    plan: input.plan,
    citations: input.citations,
    refusal: false,
  })
  const answer = followup ? `${input.answer.trim()}\n\n${followup}` : input.answer
  return {
    provider: 'openai_file_search_validated',
    answer: appendSourceUrls(answer, input.citations),
    citations: input.citations,
    refusal: false,
    timingsMs: {
      total: Date.now() - input.startedAt,
      retrieval: input.retrievalMs,
      generation: 0,
      validation: 0,
    },
    usage: input.retrieval.usage,
    diagnostics: {
      queryIntent: input.plan.intent,
      retryCount: input.retryCount,
      followup: followup || undefined,
    },
  }
}

function refusalResult(input: {
  startedAt: number
  retrieval: RagProviderResult
  retrievalMs: number
  generationMs?: number
  plan?: BrochureQueryPlan
  retryCount?: number
  citations?: RagProviderCitation[]
  usage?: RagProviderResult['usage']
}) {
  return {
    provider: 'openai_file_search_validated' as const,
    answer: NO_CLEAR_INFORMATION_ANSWER,
    citations: input.citations ?? [],
    refusal: true,
    timingsMs: {
      total: Date.now() - input.startedAt,
      retrieval: input.retrievalMs,
      generation: input.generationMs ?? 0,
      validation: 0,
    },
    usage: input.usage ?? input.retrieval.usage,
    diagnostics: input.plan
      ? {
          queryIntent: input.plan.intent,
          retryCount: input.retryCount ?? 0,
        }
      : undefined,
  }
}

function guardrailRefusalResult(input: {
  startedAt: number
  plan: BrochureQueryPlan
}): RagProviderResult {
  const followup = 'İsterseniz belgelerde yer alan başka bir konuda yardımcı olabilirim.'
  return {
    provider: 'openai_file_search_validated',
    answer: `Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır. Kesin kontenjan, kabul sonucu veya gelecek dönem ücreti garantisi verilemez.\n\n${followup}`,
    citations: [],
    refusal: true,
    timingsMs: {
      total: Date.now() - input.startedAt,
      retrieval: 0,
      generation: 0,
      validation: 0,
    },
    usage: {
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      toolCalls: 0,
      estimatedCredits: 0,
    },
    diagnostics: {
      queryIntent: input.plan.intent,
      retryCount: 0,
      followup,
    },
  }
}

function clarificationResult(input: {
  startedAt: number
  queryIntent: string
  clarification: {
    reason?: string
    question: string
  }
  usage?: RagProviderResult['usage']
}): RagProviderResult {
  return {
    provider: 'openai_file_search_validated',
    answer: input.clarification.question,
    citations: [],
    refusal: false,
    timingsMs: {
      total: Date.now() - input.startedAt,
      retrieval: 0,
      generation: 0,
      validation: 0,
    },
    usage: input.usage ?? zeroUsage(),
    diagnostics: {
      queryIntent: input.queryIntent,
      retryCount: 0,
      clarification: input.clarification.reason,
    },
  }
}

function zeroUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
    toolCalls: 0,
    estimatedCredits: 0,
  }
}

type ContextualOrchestrationAction = 'standalone' | 'rewrite' | 'clarify' | 'refuse'

type ContextualOrchestrationResult = {
  action: ContextualOrchestrationAction
  question: string
  clarificationQuestion?: string
  refusalAnswer?: string
  reason?: string
  usage?: RagProviderResult['usage']
}

function normalizeContextualHistory(history: KnowledgeSearchPlanningTurn[] | undefined) {
  return (history ?? [])
    .map((turn) => ({
      role: turn.role,
      content: turn.content.replace(/\s+/g, ' ').trim(),
    }))
    .filter((turn) => turn.content)
    .slice(-MAX_CONTEXTUAL_HISTORY_TURNS)
}

function formatContextualHistory(history: KnowledgeSearchPlanningTurn[]) {
  if (history.length === 0) return 'No recent conversation.'
  return history
    .map((turn, index) => {
      const role = turn.role === 'assistant' ? 'Assistant' : 'User'
      return `${index + 1}. ${role}: ${turn.content.slice(0, 500)}`
    })
    .join('\n')
}

function readContextualString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readContextualNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readContextualAction(value: unknown): ContextualOrchestrationAction | null {
  if (value === 'standalone' || value === 'rewrite' || value === 'clarify' || value === 'refuse') {
    return value
  }
  if (value === 'contextual_rewrite') return 'rewrite'
  return null
}

function parseContextualJson(content: string): Record<string, unknown> | null {
  try {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    const objectMatch = trimmed.match(/\{[\s\S]*\}/)
    return JSON.parse(objectMatch?.[0] ?? trimmed) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeContextualUsage(
  usage: Awaited<ReturnType<CreateCompletion>>['usage'],
  fallback: { input: string; output: string }
): RagProviderResult['usage'] {
  const inputTokens = usage?.prompt_tokens ?? Math.ceil(fallback.input.length / 4)
  const outputTokens = usage?.completion_tokens ?? Math.ceil(fallback.output.length / 4)
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    toolCalls: 0,
    estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
  }
}

function contextualCompletionParams(model: string) {
  if (/^gpt-5(?:[.-]|$)/i.test(model) || /^o\d/i.test(model)) {
    return {
      reasoning_effort: 'none',
      max_completion_tokens: CONTEXTUAL_ORCHESTRATOR_MAX_OUTPUT_TOKENS,
    }
  }

  return {
    temperature: 0,
    max_tokens: CONTEXTUAL_ORCHESTRATOR_MAX_OUTPUT_TOKENS,
  }
}

async function createDefaultContextualCompletion(
  args: Record<string, unknown>,
  options?: CreateCompletionOptions
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY for contextual RAG orchestrator')
  }
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai.chat.completions.create(
    args as never,
    options?.signal ? { signal: options.signal } : undefined
  ) as Promise<Awaited<ReturnType<CreateCompletion>>>
}

function isShortContinuationMessage(question: string) {
  const normalized = normalizeForSupport(question)
  return /^(?:olur|olur et|tamam|evet|bak|kontrol et|olur bak|olur kontrol et|edebilirsin|devam|devam et|yes|ok|okay|sure|go ahead)$/i.test(
    normalized
  )
}

function latestHistoryTurn(history: KnowledgeSearchPlanningTurn[], role: 'user' | 'assistant') {
  return history
    .slice()
    .reverse()
    .find((turn) => turn.role === role && turn.content.trim())
}

function fallbackContextualOrchestration(input: {
  question: string
  history: KnowledgeSearchPlanningTurn[]
  reason?: string
}): ContextualOrchestrationResult | null {
  if (!isShortContinuationMessage(input.question) || input.history.length === 0) return null

  const previousUser = latestHistoryTurn(input.history, 'user')?.content.trim()
  const previousAssistant = latestHistoryTurn(input.history, 'assistant')?.content.trim()
  const assistantSupport = normalizeForSupport(previousAssistant ?? '')
  const hasAssistantOffer =
    /(?:isterseniz|istersen|can check|kontrol edebilirim|bakabilirim|yardimci olabilirim)/.test(
      assistantSupport
    )
  if (!previousUser || !hasAssistantOffer) {
    return {
      action: 'clarify',
      question: input.question,
      clarificationQuestion: 'Hangi konu veya ayrıntı için devam etmemi istersiniz?',
      reason: input.reason ?? 'short_continuation_without_clear_offer',
    }
  }

  const ambiguousOffer = /(?:veya|ya da|\/| or )/.test(assistantSupport)
  if (ambiguousOffer) {
    return {
      action: 'clarify',
      question: input.question,
      clarificationQuestion:
        'Bir önceki konuyla ilgili hangi ayrıntıyı kontrol etmemi istersiniz?',
      reason: input.reason ?? 'ambiguous_assistant_offer',
    }
  }

  return {
    action: 'rewrite',
    question: previousUser,
    reason: input.reason ?? 'short_continuation_previous_topic',
  }
}

function buildContextualOrchestrationMessages(input: {
  question: string
  history: KnowledgeSearchPlanningTurn[]
}) {
  const system = [
    'You are a domain-independent conversation orchestration layer for a grounded RAG assistant.',
    'Do not answer the user.',
    'Decide whether the current user message is standalone, should be rewritten using recent conversation, needs clarification, or must be refused for safety.',
    'Always use the recent conversation when it changes what the latest message means.',
    'If the latest message only accepts an assistant offer, rewrite it only when the offer has one clear target. If the offer has multiple possible targets, ask a short clarification question.',
    'Never invent organization-specific facts. Preserve the user language.',
    'Return only valid JSON with keys: action, reason, rewritten_question, clarification_question, refusal_answer, confidence.',
    'Allowed action values: standalone, rewrite, clarify, refuse.',
  ].join(' ')
  const user = [
    `Recent conversation, oldest to newest:\n${formatContextualHistory(input.history)}`,
    `Latest user message:\n${input.question}`,
  ].join('\n\n')
  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

async function runContextualOrchestrator(input: {
  question: string
  history: KnowledgeSearchPlanningTurn[]
  model?: string
  createCompletion?: CreateCompletion
}): Promise<ContextualOrchestrationResult | null> {
  if (input.history.length === 0) return null

  const model =
    input.model?.trim() ||
    process.env.OPENAI_RAG_CONTEXTUAL_ORCHESTRATOR_MODEL?.trim() ||
    DEFAULT_CONTEXTUAL_ORCHESTRATOR_MODEL
  const messages = buildContextualOrchestrationMessages(input)
  const prompt = messages.map((message) => message.content).join('\n\n')
  const createCompletion = input.createCompletion ?? createDefaultContextualCompletion

  try {
    const completion = await createCompletion({
      model,
      response_format: { type: 'json_object' },
      messages,
      ...contextualCompletionParams(model),
    })
    const content = completion.choices?.[0]?.message?.content ?? ''
    const parsed = parseContextualJson(content)
    const action = readContextualAction(parsed?.action)
    const reason = readContextualString(parsed?.reason)
    const confidence = readContextualNumber(parsed?.confidence)
    const rewrittenQuestion = readContextualString(parsed?.rewritten_question)
    const clarificationQuestion = readContextualString(parsed?.clarification_question)
    const refusalAnswer = readContextualString(parsed?.refusal_answer)
    const usage = normalizeContextualUsage(completion.usage, { input: prompt, output: content })

    if (action === 'clarify' && clarificationQuestion) {
      return {
        action,
        question: input.question,
        clarificationQuestion,
        reason: reason || 'contextual_clarification',
        usage,
      }
    }
    if (action === 'refuse' && refusalAnswer) {
      return {
        action,
        question: input.question,
        refusalAnswer,
        reason: reason || 'contextual_refusal',
        usage,
      }
    }
    if (action === 'rewrite' && rewrittenQuestion) {
      return {
        action,
        question: rewrittenQuestion,
        reason: reason || 'contextual_rewrite',
        usage,
      }
    }
    if (action === 'standalone') {
      return {
        action,
        question: rewrittenQuestion || input.question,
        reason: reason || 'standalone',
        usage,
      }
    }

    return fallbackContextualOrchestration({
      question: input.question,
      history: input.history,
      reason: confidence !== undefined ? 'invalid_contextual_orchestrator_output' : reason,
    })
  } catch (error) {
    return fallbackContextualOrchestration({
      question: input.question,
      history: input.history,
      reason: 'contextual_orchestrator_error',
    })
  }
}

function strictDirectResult(input: {
  startedAt: number
  answer: string
  citations: RagProviderCitation[]
  refusal: boolean
  strictVerdict: string
  normalizedQuestion?: string
  researchPlan?: StrictResearchPlanDiagnostics
}): RagProviderResult {
  return {
    provider: 'openai_file_search_validated',
    answer: appendSourceUrls(input.answer, input.citations),
    citations: input.citations,
    refusal: input.refusal,
    timingsMs: {
      total: Date.now() - input.startedAt,
      retrieval: 0,
      generation: 0,
      validation: 0,
    },
    usage: zeroUsage(),
    diagnostics: {
      retryCount: 0,
      qualityMode: 'strict',
      ...(input.normalizedQuestion ? { normalizedQuestion: input.normalizedQuestion } : {}),
      strictVerdict: input.strictVerdict,
      strictQuality: classifyStrictDirectAnswerQuality({
        reason: input.strictVerdict,
        answer: input.answer,
        citations: input.citations,
        refusal: input.refusal,
      }),
      ...(input.researchPlan ? { researchPlan: input.researchPlan } : {}),
    },
  }
}

export async function runOpenAiFileSearchValidatedQuestion(
  input: OpenAiFileSearchValidatedQuestionInput
): Promise<RagProviderResult> {
  const startedAt = Date.now()
  const retrievalStartedAt = Date.now()
  const qualityMode = input.qualityMode ?? 'validated'
  const conversationHistory = normalizeContextualHistory(input.conversationHistory)
  const contextualOrchestration = await runContextualOrchestrator({
    question: input.question,
    history: conversationHistory,
    model: input.contextualOrchestratorModel,
    createCompletion: input.contextualOrchestratorCreateCompletion,
  })
  const questionForAnswer = contextualOrchestration?.question.trim() || input.question
  const applyContextualOrchestration = (result: RagProviderResult): RagProviderResult => {
    if (!contextualOrchestration) return result
    const usage = contextualOrchestration.usage
      ? usageWithExtra(result.usage, contextualOrchestration.usage)
      : result.usage
    return {
      ...result,
      usage,
      diagnostics: {
        ...result.diagnostics,
        contextualOrchestration: contextualOrchestration.action,
        ...(contextualOrchestration.reason
          ? { contextualReason: contextualOrchestration.reason }
          : {}),
        ...(questionForAnswer !== input.question ? { contextualQuestion: questionForAnswer } : {}),
      },
    }
  }

  if (contextualOrchestration?.action === 'clarify' && contextualOrchestration.clarificationQuestion) {
    return applyContextualOrchestration(
      clarificationResult({
        startedAt,
        queryIntent: 'contextual_followup',
        clarification: {
          reason: contextualOrchestration.reason,
          question: contextualOrchestration.clarificationQuestion,
        },
      })
    )
  }

  if (contextualOrchestration?.action === 'refuse' && contextualOrchestration.refusalAnswer) {
    return applyContextualOrchestration({
      provider: 'openai_file_search_validated',
      answer: contextualOrchestration.refusalAnswer,
      citations: [],
      refusal: true,
      timingsMs: {
        total: Date.now() - startedAt,
        retrieval: 0,
        generation: 0,
        validation: 0,
      },
      usage: zeroUsage(),
      diagnostics: {
        queryIntent: 'contextual_followup',
        retryCount: 0,
      },
    })
  }

  const strictUnderstanding =
    qualityMode === 'strict' ? understandStrictQuestion(questionForAnswer) : null
  const effectiveQuestion = strictUnderstanding?.normalizedQuestion ?? questionForAnswer
  const plan = planBrochureQuery(effectiveQuestion)
  const sourcePriorityGroups = uniqueSourceGroups(input.sourcePriorityGroups)
  const sourcePriorityFallbackGroups = isExactBrochureTablePlan(plan)
    ? plan.sourceGroups
    : sourcePriorityGroups.length === 0
      ? plan.sourceGroups
      : plan.sourceGroups.length > 0 &&
          !plan.sourceGroups.every((group) => sourcePriorityGroups.includes(group))
        ? plan.sourceGroups
        : []
  let sourcePriorityUsed = false
  let llmResearchPlan: StrictLlmResearchPlanResult | null = null
  const strictLlmEvaluatorEnabled = Boolean(strictUnderstanding && input.enableStrictLlmEvaluator)
  const sourcePriorityDiagnostics = () =>
    sourcePriorityGroups.length > 0
      ? {
          primarySourceGroups: sourcePriorityGroups,
          ...(sourcePriorityFallbackGroups.length > 0
            ? { fallbackSourceGroups: sourcePriorityFallbackGroups }
            : {}),
          used: sourcePriorityUsed,
        }
      : undefined
  const applySourcePriorityDiagnostics = (result: RagProviderResult): RagProviderResult => {
    const diagnostics = sourcePriorityDiagnostics()
    if (!diagnostics) return result
    return {
      ...result,
      diagnostics: {
        ...result.diagnostics,
        sourcePriority: diagnostics,
      },
    }
  }
  const llmResearchPlanDiagnostics = () =>
    llmResearchPlan
      ? {
          route: llmResearchPlan.route,
          reason: llmResearchPlan.reason,
          requiredEvidence: llmResearchPlan.requiredEvidence,
          used: true,
          hopCount: llmResearchPlan.hops.length,
          ...(typeof llmResearchPlan.confidence === 'number'
            ? { confidence: llmResearchPlan.confidence }
            : {}),
        }
      : undefined
  const applyLlmResearchPlanDiagnostics = (result: RagProviderResult): RagProviderResult => {
    const diagnostics = llmResearchPlanDiagnostics()
    if (!diagnostics || !llmResearchPlan || result.diagnostics?.llmResearchPlan) return result
    return {
      ...result,
      usage: usageWithExtra(result.usage, llmResearchPlan.usage),
      diagnostics: {
        ...result.diagnostics,
        llmResearchPlan: diagnostics,
      },
    }
  }
  const buildResearchPlan = (
    catalogAnswer: StrictCatalogAnswer | null = null
  ): StrictResearchPlan | undefined =>
    strictUnderstanding
      ? buildStrictResearchPlan({
          question: questionForAnswer,
          understanding: strictUnderstanding,
          brochurePlan: plan,
          catalogAnswer,
          enableStrictLlmEvaluator: strictLlmEvaluatorEnabled,
        })
      : undefined
  const researchPlanDiagnostics = (catalogAnswer: StrictCatalogAnswer | null = null) => {
    const researchPlan = buildResearchPlan(catalogAnswer)
    return researchPlan ? summarizeStrictResearchPlan(researchPlan) : undefined
  }
  const researchBlackboard: StrictResearchBlackboard | undefined = strictUnderstanding
    ? {
        facets: classifyStrictQuestionFacets(strictUnderstanding),
        attempts: [],
      }
    : undefined
  const recordResearchAttempt = (attempt: StrictResearchBlackboardAttempt) => {
    researchBlackboard?.attempts.push(attempt)
  }
  const strictDiagnostics = strictUnderstanding
    ? {
        qualityMode: 'strict' as const,
        normalizedQuestion: effectiveQuestion,
        researchPlan: researchPlanDiagnostics(null),
      }
    : undefined
  const finalize = (
    result: RagProviderResult,
    strictVerdict?: string,
    claimLedger?: ReturnType<typeof buildStrictClaimLedger>
  ): RagProviderResult => {
    const contextualResult = applyLlmResearchPlanDiagnostics(
      applySourcePriorityDiagnostics(applyContextualOrchestration(result))
    )
    if (!strictDiagnostics) return contextualResult
    if (strictVerdict && researchBlackboard) {
      researchBlackboard.finalVerdict = strictVerdict
    }
    return {
      ...contextualResult,
      diagnostics: {
        ...contextualResult.diagnostics,
        ...strictDiagnostics,
        ...(strictVerdict ? { strictVerdict } : {}),
        ...(claimLedger ? { claimLedger: summarizeStrictClaimLedger(claimLedger) } : {}),
        ...(researchBlackboard ? { researchBlackboard } : {}),
      },
    }
  }
  const finalizeLlmDiagnostics = (
    result: RagProviderResult,
    evaluation: StrictLlmEvaluatorResult
  ): RagProviderResult => ({
    ...result,
    usage: usageWithExtra(result.usage, evaluation.usage),
    diagnostics: {
      ...result.diagnostics,
      strictLlmVerdict: evaluation.verdict.action,
      strictLlmReason: evaluation.verdict.reason,
      ...(evaluation.verdict.retryQuery
        ? { strictLlmRetryQuery: evaluation.verdict.retryQuery }
        : {}),
    },
  })
  const resultWithEvidenceRetryDiagnostics = (
    result: RagProviderResult,
    retryPlan: StrictEvidenceRetryPlan,
    outcome: 'passed' | 'no_evidence' | 'no_supported_answer' | 'critic_rejected'
  ): RagProviderResult => ({
    ...result,
    diagnostics: {
      ...result.diagnostics,
      evidenceRetry: {
        attempted: true,
        outcome,
        reason: retryPlan.reason,
        query: retryPlan.query,
        facets: retryPlan.facets,
      },
    },
  })
  const finalizeCatalog = (catalogAnswer: StrictCatalogAnswer) =>
    applyContextualOrchestration(
      strictDirectResult({
        startedAt,
        answer: catalogAnswer.answer,
        citations: catalogAnswer.citations,
        refusal: catalogAnswer.refusal,
        strictVerdict: catalogAnswer.reason,
        normalizedQuestion: effectiveQuestion,
        researchPlan: researchPlanDiagnostics(catalogAnswer),
      })
    )
  const applyStrictLlmEvaluator = async (
    result: RagProviderResult,
    evaluatorCitations: RagProviderCitation[] = result.citations
  ): Promise<RagProviderResult> => {
    if (!strictUnderstanding || !strictLlmEvaluatorEnabled) return result

    const evaluation = await evaluateAnswerWithStrictLlm({
      question: questionForAnswer,
      normalizedQuestion: effectiveQuestion,
      understanding: strictUnderstanding,
      answer: result.answer,
      citations: evaluatorCitations,
      model: input.strictEvaluatorModel,
      createCompletion: input.strictEvaluatorCreateCompletion,
    })
    if (!evaluation || evaluation.verdict.action === 'pass') {
      return evaluation ? finalizeLlmDiagnostics(result, evaluation) : result
    }

    if (evaluation.verdict.action === 'repair' && evaluation.verdict.revisedAnswer) {
      const speculativeRepair = llmRepairLooksSpeculativeUnsupported(
        evaluation.verdict.revisedAnswer
      )
      const repairedCritic = speculativeRepair
        ? null
        : evaluateStrictAnswer({
            question: questionForAnswer,
            understanding: strictUnderstanding,
            answer: evaluation.verdict.revisedAnswer,
            citations: evaluatorCitations,
          })
      const rejectedRepair = speculativeRepair || repairedCritic?.action !== 'pass'
      const revisedAnswer = rejectedRepair
        ? (repairedCritic?.repairedAnswer ?? result.answer)
        : evaluation.verdict.revisedAnswer
      const repairedCitations = rejectedRepair
        ? (repairedCritic?.repairedCitations ?? result.citations)
        : evaluatorCitations
      const refusal = rejectedRepair
        ? (repairedCritic?.refusal ?? result.refusal ?? rawAnswerLooksLikeRefusal(revisedAnswer))
        : rawAnswerLooksLikeRefusal(revisedAnswer)
      return finalizeLlmDiagnostics(
        {
          ...result,
          answer: appendSourceUrls(revisedAnswer, refusal ? [] : repairedCitations),
          citations: refusal ? [] : repairedCitations,
          refusal,
          timingsMs: {
            ...result.timingsMs,
            total: Date.now() - startedAt,
          },
        },
        evaluation
      )
    }

    if (evaluation.verdict.action === 'clarify') {
      const question =
        evaluation.verdict.clarificationQuestion ??
        'Tam olarak hangi bölüm, program veya konu için bilgi almak istiyorsunuz?'
      return finalizeLlmDiagnostics(
        {
          ...result,
          answer: question,
          citations: [],
          refusal: false,
          timingsMs: {
            ...result.timingsMs,
            total: Date.now() - startedAt,
          },
        },
        evaluation
      )
    }

    if (evaluation.verdict.action === 'retry' && evaluation.verdict.retryQuery) {
      return runStrictLlmRetry({
        baseResult: result,
        evaluation,
      })
    }

    const refusalAnswer =
      evaluation.verdict.revisedAnswer ||
      (result.refusal && result.answer.trim() ? result.answer : NO_CLEAR_INFORMATION_ANSWER)
    return finalizeLlmDiagnostics(
      {
        ...result,
        answer: refusalAnswer,
        citations: [],
        refusal: true,
        timingsMs: {
          ...result.timingsMs,
          total: Date.now() - startedAt,
        },
      },
      evaluation
    )
  }
  const runEvidenceSeekingRetry = async (
    baseResult: RagProviderResult,
    verdict: StrictAnswerCriticVerdict
  ): Promise<RagProviderResult | null> => {
    const strictResearchPlan = buildResearchPlan(null)
    if (!strictUnderstanding || !strictResearchPlan) return null

    const retryPlan = buildStrictEvidenceRetryPlan({
      question: questionForAnswer,
      understanding: strictUnderstanding,
      researchPlan: strictResearchPlan,
      criticReason: verdict.reason,
    })
    if (!retryPlan) return null

    const retryStartedAt = Date.now()
    const retryRetrieval = await runOpenAiFileSearchQuestion({
      client: input.client,
      model: input.model,
      vectorStoreId: input.vectorStoreId,
      question: retryPlan.query,
      maxResults: Math.max(input.maxResults ?? 8, retryPlan.maxResults),
      maxOutputTokens: input.maxOutputTokens,
      instructionProfile: input.instructionProfile,
      extraInstructions:
        'Use the file_search tool and retrieve direct evidence for the missing answer facet. Ignore adjacent facts that do not answer the original user question.',
      citationSourcesByFilename: input.citationSourcesByFilename,
      filters: sourceGroupFilter(plan),
    })
    const retryRetrievalMs = Date.now() - retryStartedAt
    const retryCount = (baseResult.diagnostics?.retryCount ?? 0) + 1
    recordResearchAttempt({
      stage: 'evidence_retry',
      query: retryPlan.query,
      sourceGroups: retryPlan.sourceGroups,
      citationCount: retryRetrieval.citations.length,
      reason: retryPlan.reason,
    })

    const usageAfterRetryRetrieval = usageWithExtra(baseResult.usage, retryRetrieval.usage)
    const resultAfterRetryRetrieval = resultWithEvidenceRetryDiagnostics(
      {
        ...baseResult,
        timingsMs: {
          ...baseResult.timingsMs,
          total: Date.now() - startedAt,
          retrieval: (baseResult.timingsMs.retrieval ?? 0) + retryRetrievalMs,
        },
        usage: usageAfterRetryRetrieval,
        diagnostics: {
          ...baseResult.diagnostics,
          retryCount,
        },
      },
      retryPlan,
      'no_evidence'
    )

    const retryChunks = citationsToChunks(retryRetrieval.citations)
    if (retryChunks.length === 0) return resultAfterRetryRetrieval

    const retryEvidencePack = buildRagEvidencePack({
      userMessage: effectiveQuestion,
      chunks: retryChunks,
    })
    if (retryEvidencePack.items.length === 0) return resultAfterRetryRetrieval

    const retryGenerationStartedAt = Date.now()
    const retryGenerated = await generateGroundedRagAnswer({
      userMessage: effectiveQuestion,
      responseLanguage: resolveMvpResponseLanguage(effectiveQuestion),
      chunks: retryChunks,
      evidencePack: retryEvidencePack,
      model: input.answerModel,
      createCompletion: input.createCompletion,
      includeEngagement: false,
      settings:
        input.settings ??
        (input.instructionProfile === 'qualy'
          ? {
              bot_name: 'Qualy',
              prompt:
                'Use a warm, helpful, concise Qualy assistant voice. Answer only from validated evidence. If evidence is insufficient, return NO_ANSWER.',
            }
          : undefined),
    })
    const retryGenerationMs = Date.now() - retryGenerationStartedAt
    const retryAnswer =
      retryGenerated.usedGeneration && retryGenerated.answer.trim()
        ? retryGenerated.answer
        : cleanAnswer(retryRetrieval.answer)
    const retryCitations =
      retryGenerated.usedGeneration && retryGenerated.answer.trim()
        ? selectedCitations(retryRetrieval.citations, retryGenerated.sourceChunks)
        : supportingCitationsForAnswer(retryAnswer, retryRetrieval.citations)
    const retryUsage = usageWithExtra(usageAfterRetryRetrieval, retryGenerated.usage)

    if (
      !retryAnswer ||
      rawAnswerLooksLikeRefusal(retryAnswer) ||
      !isRawAnswerSupported({
        question: effectiveQuestion,
        answer: retryAnswer,
        citations: retryCitations,
      })
    ) {
      return resultWithEvidenceRetryDiagnostics(
        {
          ...resultAfterRetryRetrieval,
          timingsMs: {
            ...resultAfterRetryRetrieval.timingsMs,
            total: Date.now() - startedAt,
            generation: (resultAfterRetryRetrieval.timingsMs.generation ?? 0) + retryGenerationMs,
          },
          usage: retryUsage,
        },
        retryPlan,
        'no_supported_answer'
      )
    }

    const retryFollowup = buildValidatedFollowup({
      question: effectiveQuestion,
      answer: retryAnswer,
      plan,
      citations: retryCitations,
      refusal: false,
    })
    const retryGroundedAnswer = retryFollowup ? `${retryAnswer}\n\n${retryFollowup}` : retryAnswer
    const retryResult = resultWithEvidenceRetryDiagnostics(
      {
        provider: 'openai_file_search_validated',
        answer: appendSourceUrls(retryGroundedAnswer, retryCitations),
        citations: retryCitations,
        refusal: false,
        timingsMs: {
          total: Date.now() - startedAt,
          retrieval: (baseResult.timingsMs.retrieval ?? 0) + retryRetrievalMs,
          generation: (baseResult.timingsMs.generation ?? 0) + retryGenerationMs,
          validation: baseResult.timingsMs.validation ?? 0,
        },
        usage: retryUsage,
        diagnostics: {
          ...baseResult.diagnostics,
          queryIntent: plan.intent,
          retryCount,
          followup: retryFollowup || undefined,
        },
      },
      retryPlan,
      'passed'
    )

    const retryClaimLedger = buildStrictClaimLedger({
      question: questionForAnswer,
      understanding: strictUnderstanding,
      answer: retryResult.answer,
      citations: retryResult.citations,
    })
    const retryCritic = evaluateStrictAnswer({
      question: questionForAnswer,
      understanding: strictUnderstanding,
      answer: retryResult.answer,
      citations: retryResult.citations,
      claimLedger: retryClaimLedger,
    })

    if (retryCritic.action === 'pass') {
      return applyStrictLlmEvaluator(finalize(retryResult, retryCritic.reason, retryClaimLedger))
    }

    return resultWithEvidenceRetryDiagnostics(retryResult, retryPlan, 'critic_rejected')
  }

  const finalizeWithCritic = async (result: RagProviderResult): Promise<RagProviderResult> => {
    if (!strictUnderstanding) {
      return applyLlmResearchPlanDiagnostics(
        applySourcePriorityDiagnostics(applyContextualOrchestration(result))
      )
    }
    const claimLedger = buildStrictClaimLedger({
      question: questionForAnswer,
      understanding: strictUnderstanding,
      answer: result.answer,
      citations: result.citations,
    })
    const verdict = evaluateStrictAnswer({
      question: questionForAnswer,
      understanding: strictUnderstanding,
      answer: result.answer,
      citations: result.citations,
      claimLedger,
    })
    if (verdict.action === 'pass') {
      return applyStrictLlmEvaluator(finalize(result, verdict.reason, claimLedger))
    }

    const retryResult = await runEvidenceSeekingRetry(result, verdict)
    if (retryResult?.diagnostics?.evidenceRetry?.outcome === 'passed') {
      return retryResult
    }
    const resultForRepair = retryResult ?? result
    const repairedAnswer = verdict.repairedAnswer ?? NO_CLEAR_INFORMATION_ANSWER
    const repairedCitations = verdict.repairedCitations ?? []
    const repairedResult = finalize(
      {
        ...resultForRepair,
        answer: appendSourceUrls(repairedAnswer, repairedCitations),
        citations: repairedCitations,
        refusal: verdict.refusal ?? true,
        timingsMs: {
          ...resultForRepair.timingsMs,
          total: Date.now() - startedAt,
          validation: Math.max(resultForRepair.timingsMs.validation ?? 0, 0),
        },
      },
      verdict.reason,
      claimLedger
    )
    if (verdict.reason === 'contextual_no_info') {
      return applyStrictLlmEvaluator(repairedResult, result.citations)
    }
    return repairedResult
  }

  if (strictUnderstanding?.safety && strictUnderstanding.safety !== 'none') {
    return applyContextualOrchestration(
      strictDirectResult({
        startedAt,
        answer: strictSafetyAnswer(strictUnderstanding.safety),
        citations: [],
        refusal: true,
        strictVerdict: 'unsafe_sensitive_data',
        normalizedQuestion: effectiveQuestion,
        researchPlan: researchPlanDiagnostics(null),
      })
    )
  }

  const catalogAnswer = strictUnderstanding
    ? resolveStrictCatalogAnswer({
        question: questionForAnswer,
        understanding: strictUnderstanding,
      })
    : null
  if (catalogAnswer) {
    return finalizeCatalog(catalogAnswer)
  }

  if (plan.intent === 'unsupported_guardrail') {
    return finalize(guardrailRefusalResult({ startedAt, plan }))
  }
  const clarification =
    plan.clarification ??
    buildClarificationGateResult({
      message: effectiveQuestion,
      language: resolveMvpResponseLanguage(effectiveQuestion),
      context: 'education',
    })
  if (clarification) {
    return finalize(
      clarificationResult({
        startedAt,
        queryIntent: plan.intent,
        clarification,
      })
    )
  }

  const deterministicResearchPlan = buildResearchPlan(null)
  if (
    strictUnderstanding &&
    deterministicResearchPlan &&
    input.enableLlmResearchPlanner &&
    !isExactBrochureTablePlan(plan)
  ) {
    llmResearchPlan = await runStrictLlmResearchPlanner({
      question: questionForAnswer,
      normalizedQuestion: effectiveQuestion,
      deterministicPlan: deterministicResearchPlan,
      brochureSourceGroups: sourcePriorityGroups,
      model: input.researchPlannerModel,
      createCompletion: input.researchPlannerCreateCompletion,
    })
  }

  async function runStrictLlmRetry(inputRetry: {
    baseResult: RagProviderResult
    evaluation: StrictLlmEvaluatorResult
  }): Promise<RagProviderResult> {
    const retryQuery = inputRetry.evaluation.verdict.retryQuery?.trim()
    if (!strictUnderstanding || !retryQuery) {
      return finalizeLlmDiagnostics(inputRetry.baseResult, inputRetry.evaluation)
    }

    const retryStartedAt = Date.now()
    const retryRetrieval = await runOpenAiFileSearchQuestion({
      client: input.client,
      model: input.model,
      vectorStoreId: input.vectorStoreId,
      question: retryQuery,
      maxResults: Math.max(input.maxResults ?? 8, 12),
      maxOutputTokens: input.maxOutputTokens,
      instructionProfile: input.instructionProfile,
      extraInstructions:
        'Use the file_search tool and retrieve stronger evidence for the original user question. Keep any direct answer minimal; Qualy will validate and rewrite from retrieved evidence separately.',
      citationSourcesByFilename: input.citationSourcesByFilename,
      filters: sourceGroupFilter(plan),
    })
    const retryRetrievalMs = Date.now() - retryStartedAt
    const retryCount = (inputRetry.baseResult.diagnostics?.retryCount ?? 0) + 1
    const usageAfterRetryRetrieval = usageWithExtra(
      inputRetry.baseResult.usage,
      retryRetrieval.usage
    )

    const retryChunks = citationsToChunks(retryRetrieval.citations)
    if (retryChunks.length === 0) {
      return finalizeLlmDiagnostics(
        finalize(
          {
            ...inputRetry.baseResult,
            answer: NO_CLEAR_INFORMATION_ANSWER,
            citations: [],
            refusal: true,
            timingsMs: {
              ...inputRetry.baseResult.timingsMs,
              total: Date.now() - startedAt,
              retrieval: (inputRetry.baseResult.timingsMs.retrieval ?? 0) + retryRetrievalMs,
            },
            usage: usageAfterRetryRetrieval,
            diagnostics: {
              ...inputRetry.baseResult.diagnostics,
              queryIntent: plan.intent,
              retryCount,
            },
          },
          'insufficient_answer'
        ),
        inputRetry.evaluation
      )
    }

    const retryEvidencePack = buildRagEvidencePack({
      userMessage: effectiveQuestion,
      chunks: retryChunks,
    })
    if (retryEvidencePack.items.length === 0) {
      return finalizeLlmDiagnostics(
        finalize(
          {
            ...inputRetry.baseResult,
            answer: NO_CLEAR_INFORMATION_ANSWER,
            citations: [],
            refusal: true,
            timingsMs: {
              ...inputRetry.baseResult.timingsMs,
              total: Date.now() - startedAt,
              retrieval: (inputRetry.baseResult.timingsMs.retrieval ?? 0) + retryRetrievalMs,
            },
            usage: usageAfterRetryRetrieval,
            diagnostics: {
              ...inputRetry.baseResult.diagnostics,
              queryIntent: plan.intent,
              retryCount,
            },
          },
          'insufficient_answer'
        ),
        inputRetry.evaluation
      )
    }

    const retryGenerationStartedAt = Date.now()
    const retryGenerated = await generateGroundedRagAnswer({
      userMessage: effectiveQuestion,
      responseLanguage: resolveMvpResponseLanguage(effectiveQuestion),
      chunks: retryChunks,
      evidencePack: retryEvidencePack,
      model: input.answerModel,
      createCompletion: input.createCompletion,
      includeEngagement: false,
      settings:
        input.settings ??
        (input.instructionProfile === 'qualy'
          ? {
              bot_name: 'Qualy',
              prompt:
                'Use a warm, helpful, concise Qualy assistant voice. Answer only from validated evidence. If evidence is insufficient, return NO_ANSWER.',
            }
          : undefined),
    })
    const retryGenerationMs = Date.now() - retryGenerationStartedAt

    const retryAnswer =
      retryGenerated.usedGeneration && retryGenerated.answer.trim()
        ? retryGenerated.answer
        : cleanAnswer(retryRetrieval.answer)
    const retryCitations =
      retryGenerated.usedGeneration && retryGenerated.answer.trim()
        ? selectedCitations(retryRetrieval.citations, retryGenerated.sourceChunks)
        : supportingCitationsForAnswer(retryAnswer, retryRetrieval.citations)
    const retryUsage = usageWithExtra(usageAfterRetryRetrieval, retryGenerated.usage)

    if (
      !retryAnswer ||
      rawAnswerLooksLikeRefusal(retryAnswer) ||
      !isRawAnswerSupported({
        question: effectiveQuestion,
        answer: retryAnswer,
        citations: retryCitations,
      })
    ) {
      return finalizeLlmDiagnostics(
        finalize(
          {
            ...inputRetry.baseResult,
            answer: NO_CLEAR_INFORMATION_ANSWER,
            citations: [],
            refusal: true,
            timingsMs: {
              total: Date.now() - startedAt,
              retrieval: (inputRetry.baseResult.timingsMs.retrieval ?? 0) + retryRetrievalMs,
              generation: (inputRetry.baseResult.timingsMs.generation ?? 0) + retryGenerationMs,
              validation: inputRetry.baseResult.timingsMs.validation ?? 0,
            },
            usage: retryUsage,
            diagnostics: {
              ...inputRetry.baseResult.diagnostics,
              queryIntent: plan.intent,
              retryCount,
            },
          },
          'insufficient_answer'
        ),
        inputRetry.evaluation
      )
    }

    const retryFollowup = buildValidatedFollowup({
      question: effectiveQuestion,
      answer: retryAnswer,
      plan,
      citations: retryCitations,
      refusal: false,
    })
    const retryGroundedAnswer = retryFollowup ? `${retryAnswer}\n\n${retryFollowup}` : retryAnswer
    let retryResult: RagProviderResult = {
      provider: 'openai_file_search_validated',
      answer: appendSourceUrls(retryGroundedAnswer, retryCitations),
      citations: retryCitations,
      refusal: false,
      timingsMs: {
        total: Date.now() - startedAt,
        retrieval: (inputRetry.baseResult.timingsMs.retrieval ?? 0) + retryRetrievalMs,
        generation: (inputRetry.baseResult.timingsMs.generation ?? 0) + retryGenerationMs,
        validation: inputRetry.baseResult.timingsMs.validation ?? 0,
      },
      usage: retryUsage,
      diagnostics: {
        ...inputRetry.baseResult.diagnostics,
        queryIntent: plan.intent,
        retryCount,
        followup: retryFollowup || undefined,
      },
    }

    const retryCritic = evaluateStrictAnswer({
      question: questionForAnswer,
      understanding: strictUnderstanding,
      answer: retryResult.answer,
      citations: retryResult.citations,
    })
    if (retryCritic.action !== 'pass') {
      const repairedAnswer = retryCritic.repairedAnswer ?? NO_CLEAR_INFORMATION_ANSWER
      const repairedCitations = retryCritic.repairedCitations ?? []
      retryResult = {
        ...retryResult,
        answer: appendSourceUrls(repairedAnswer, repairedCitations),
        citations: repairedCitations,
        refusal: retryCritic.refusal ?? true,
        timingsMs: {
          ...retryResult.timingsMs,
          total: Date.now() - startedAt,
        },
      }
    }

    return finalizeLlmDiagnostics(finalize(retryResult, retryCritic.reason), inputRetry.evaluation)
  }

  const retrievalAttempts: RagProviderResult[] = []
  const retrievalAttemptKeys = new Set<string>()
  const shouldRunSourcePriority =
    sourcePriorityGroups.length > 0 && !isExactBrochureTablePlan(plan)

  if (shouldRunSourcePriority) {
    sourcePriorityUsed = true
    retrievalAttemptKeys.add(retrievalAttemptKey(effectiveQuestion, sourcePriorityGroups))
    const priorityRetrieval = await runOpenAiFileSearchQuestion({
      client: input.client,
      model: input.model,
      vectorStoreId: input.vectorStoreId,
      question: effectiveQuestion,
      maxResults: input.maxResults,
      maxOutputTokens: input.maxOutputTokens,
      instructionProfile: input.instructionProfile,
      extraInstructions:
        'Use the file_search tool and keep any direct answer minimal; Qualy will validate and rewrite from retrieved evidence separately. Prefer these configured primary sources before broader approved corpus evidence.',
      citationSourcesByFilename: input.citationSourcesByFilename,
      filters: sourceGroupFilterForGroups(sourcePriorityGroups),
    })
    retrievalAttempts.push(priorityRetrieval)
    recordResearchAttempt({
      stage: 'source_priority_retrieval',
      query: effectiveQuestion,
      sourceGroups: sourcePriorityGroups,
      citationCount: priorityRetrieval.citations.length,
    })
  }

  for (const hop of llmResearchPlan?.hops ?? []) {
    const sourceGroups = uniqueSourceGroups(hop.sourceGroups)
    const attemptKey = retrievalAttemptKey(hop.query, sourceGroups)
    if (retrievalAttemptKeys.has(attemptKey)) continue
    retrievalAttemptKeys.add(attemptKey)

    const hopRetrieval = await runOpenAiFileSearchQuestion({
      client: input.client,
      model: input.model,
      vectorStoreId: input.vectorStoreId,
      question: hop.query,
      maxResults: Math.max(input.maxResults ?? 8, hop.maxResults ?? 8),
      maxOutputTokens: input.maxOutputTokens,
      instructionProfile: input.instructionProfile,
      extraInstructions: [
        'Use the file_search tool and retrieve direct evidence for this research-plan hop.',
        'Keep any direct answer minimal; Qualy will validate and rewrite from retrieved evidence separately.',
        `Hop purpose: ${hop.purpose}`,
      ].join(' '),
      citationSourcesByFilename: input.citationSourcesByFilename,
      filters: sourceGroupFilterForGroups(sourceGroups),
    })
    retrievalAttempts.push(hopRetrieval)
    recordResearchAttempt({
      stage: 'llm_research_hop',
      query: hop.query,
      sourceGroups,
      citationCount: hopRetrieval.citations.length,
      reason: hop.purpose,
    })
  }

  const shouldRunDefaultRetrieval =
    !llmResearchPlan || retrievalAttempts.length === 0 || !hasAnyCitation(retrievalAttempts)

  if (shouldRunDefaultRetrieval) {
    const fallbackKey = retrievalAttemptKey(effectiveQuestion, sourcePriorityFallbackGroups)
    if (!retrievalAttemptKeys.has(fallbackKey)) {
      const firstRetrieval = await runOpenAiFileSearchQuestion({
        client: input.client,
        model: input.model,
        vectorStoreId: input.vectorStoreId,
        question: effectiveQuestion,
        maxResults: input.maxResults,
        maxOutputTokens: input.maxOutputTokens,
        instructionProfile: input.instructionProfile,
        extraInstructions:
          'Use the file_search tool and keep any direct answer minimal; Qualy will validate and rewrite from retrieved evidence separately.',
        citationSourcesByFilename: input.citationSourcesByFilename,
        filters: sourceGroupFilterForGroups(sourcePriorityFallbackGroups),
      })
      recordResearchAttempt({
        stage: shouldRunSourcePriority ? 'fallback_retrieval' : 'initial_retrieval',
        query: effectiveQuestion,
        sourceGroups: sourcePriorityFallbackGroups,
        citationCount: firstRetrieval.citations.length,
      })
      retrievalAttempts.push(firstRetrieval)
      retrievalAttemptKeys.add(fallbackKey)
    }
  }

  let retrieval = retrievalAttempts[retrievalAttempts.length - 1] ?? {
    provider: 'openai_file_search_validated' as const,
    answer: '',
    citations: [],
    refusal: true,
    timingsMs: {
      total: 0,
      retrieval: 0,
      generation: 0,
      validation: 0,
    },
    usage: zeroUsage(),
  }

  if (plan.intent === 'brochure_table_fact') {
    let tableFact = resolveBrochureTableFact({
      plan,
      citations: retrieval.citations,
    })
    if (!tableFact) {
      const retry = await runOpenAiFileSearchQuestion({
        client: input.client,
        model: input.model,
        vectorStoreId: input.vectorStoreId,
        question: plan.retryQuery,
        maxResults: input.maxResults,
        maxOutputTokens: input.maxOutputTokens,
        instructionProfile: input.instructionProfile,
        extraInstructions:
          'Use the file_search tool and retrieve the exact matching brochure table row. Keep any direct answer minimal; Qualy will validate the row separately.',
        citationSourcesByFilename: input.citationSourcesByFilename,
        filters: sourceGroupFilter(plan),
      })
      retrievalAttempts.push(retry)
      retrieval = retry
      tableFact = resolveBrochureTableFact({
        plan,
        citations: retrieval.citations,
      })
    }

    if (tableFact) {
      retrieval = retrievalWithCombinedUsage(retrieval, retrievalAttempts)
      const retrievalMs = Date.now() - retrievalStartedAt
      return finalizeWithCritic(
        directValidatedResult({
          startedAt,
          retrieval,
          retrievalMs,
          question: effectiveQuestion,
          plan,
          retryCount: retrievalAttempts.length - 1,
          answer: tableFact.answer,
          citations: [tableFact.citation],
        })
      )
    }
  }

  let approvedSourceFact = resolveApprovedSourceFact({
    question: effectiveQuestion,
    plan,
    citations: retrievalAttempts.flatMap((attempt) => attempt.citations),
  })
  const factRetryQuery = approvedSourceFact
    ? undefined
    : approvedSourceRetryQuery(effectiveQuestion, plan)
  if (factRetryQuery) {
    const retry = await runOpenAiFileSearchQuestion({
      client: input.client,
      model: input.model,
      vectorStoreId: input.vectorStoreId,
      question: factRetryQuery,
      maxResults: Math.max(input.maxResults ?? 8, 20),
      maxOutputTokens: input.maxOutputTokens,
      instructionProfile: input.instructionProfile,
      extraInstructions:
        'Use the file_search tool and retrieve the exact approved contact fields. Keep any direct answer minimal; Qualy will validate the fields separately.',
      citationSourcesByFilename: input.citationSourcesByFilename,
      filters: sourceGroupFilter(plan),
    })
    retrievalAttempts.push(retry)
    retrieval = retry
    approvedSourceFact = resolveApprovedSourceFact({
      question: effectiveQuestion,
      plan,
      citations: retrievalAttempts.flatMap((attempt) => attempt.citations),
    })
  }

  if (retrievalAttempts.length > 1) {
    retrieval = retrievalWithCombinedUsage(retrieval, retrievalAttempts)
  }
  const retrievalMs = Date.now() - retrievalStartedAt
  if (approvedSourceFact) {
    return finalizeWithCritic(
      directValidatedResult({
        startedAt,
        retrieval,
        retrievalMs,
        question: effectiveQuestion,
        plan,
        retryCount: retrievalAttempts.length - 1,
        answer: approvedSourceFact.answer,
        citations: approvedSourceFact.citations,
      })
    )
  }

  if (plan.intent === 'document_router') {
    const citations = documentRouterCitations(
      effectiveQuestion,
      dedupeCitationsByTitle([
        ...retrieval.citations,
        ...catalogCitations(input.citationSourcesByFilename),
      ])
    )
    if (citations.length > 0) {
      return finalizeWithCritic(
        directValidatedResult({
          startedAt,
          retrieval,
          retrievalMs,
          question: effectiveQuestion,
          plan,
          retryCount: retrievalAttempts.length - 1,
          answer: documentRouterAnswer(effectiveQuestion, citations),
          citations,
        })
      )
    }
  }

  const chunks = citationsToChunks(retrieval.citations)
  if (chunks.length === 0) {
    return finalizeWithCritic(
      refusalResult({
        startedAt,
        retrieval,
        retrievalMs,
        plan,
        retryCount: retrievalAttempts.length - 1,
      })
    )
  }

  const evidencePack = buildRagEvidencePack({
    userMessage: effectiveQuestion,
    chunks,
  })
  if (evidencePack.items.length === 0) {
    return finalizeWithCritic(
      refusalResult({
        startedAt,
        retrieval,
        retrievalMs,
        plan,
        retryCount: retrievalAttempts.length - 1,
      })
    )
  }

  const generationStartedAt = Date.now()
  const generated = await generateGroundedRagAnswer({
    userMessage: effectiveQuestion,
    responseLanguage: resolveMvpResponseLanguage(effectiveQuestion),
    chunks,
    evidencePack,
    model: input.answerModel,
    createCompletion: input.createCompletion,
    includeEngagement: false,
    settings:
      input.settings ??
      (input.instructionProfile === 'qualy'
        ? {
            bot_name: 'Qualy',
            prompt:
              'Use a warm, helpful, concise Qualy assistant voice. Answer only from validated evidence. If evidence is insufficient, return NO_ANSWER.',
          }
        : undefined),
  })
  const generationMs = Date.now() - generationStartedAt
  if (!generated.usedGeneration || !generated.answer.trim()) {
    const rawAnswer = cleanAnswer(retrieval.answer)
    if (rawAnswerLooksLikeRefusal(rawAnswer)) {
      return finalizeWithCritic(
        refusalResult({
          startedAt,
          retrieval,
          retrievalMs,
          generationMs,
          plan,
          retryCount: retrievalAttempts.length - 1,
          usage: combinedUsage(retrieval.usage, generated.usage),
        })
      )
    }
    if (
      !retrieval.refusal &&
      isRawAnswerSupported({
        question: effectiveQuestion,
        answer: rawAnswer,
        citations: retrieval.citations,
      })
    ) {
      const citations = supportingCitationsForAnswer(rawAnswer, retrieval.citations)
      const followup = buildValidatedFollowup({
        question: effectiveQuestion,
        answer: rawAnswer,
        plan,
        citations,
        refusal: false,
      })
      const answer = followup ? `${rawAnswer}\n\n${followup}` : rawAnswer
      return finalizeWithCritic({
        provider: 'openai_file_search_validated',
        answer: appendSourceUrls(answer, citations),
        citations,
        refusal: false,
        timingsMs: {
          total: Date.now() - startedAt,
          retrieval: retrievalMs,
          generation: generationMs,
          validation: 0,
        },
        usage: combinedUsage(retrieval.usage, generated.usage),
        diagnostics: {
          queryIntent: plan.intent,
          retryCount: retrievalAttempts.length - 1,
          followup: followup || undefined,
        },
      })
    }
    return finalizeWithCritic(
      refusalResult({
        startedAt,
        retrieval,
        retrievalMs,
        generationMs,
        plan,
        retryCount: retrievalAttempts.length - 1,
        citations: strictLlmEvaluatorEnabled ? retrieval.citations : undefined,
        usage: combinedUsage(retrieval.usage, generated.usage),
      })
    )
  }

  const citations = selectedCitations(retrieval.citations, generated.sourceChunks)
  const followup = buildValidatedFollowup({
    question: effectiveQuestion,
    answer: generated.answer,
    plan,
    citations,
    refusal: false,
  })
  const groundedAnswer = followup ? `${generated.answer}\n\n${followup}` : generated.answer
  const answer = appendSourceUrls(groundedAnswer, citations)
  const usage = combinedUsage(retrieval.usage, generated.usage)

  return finalizeWithCritic({
    provider: 'openai_file_search_validated',
    answer,
    citations,
    refusal: false,
    timingsMs: {
      total: Date.now() - startedAt,
      retrieval: retrievalMs,
      generation: generationMs,
      validation: 0,
    },
    usage,
    diagnostics: {
      queryIntent: plan.intent,
      retryCount: retrievalAttempts.length - 1,
      followup: followup || undefined,
    },
  })
}
