import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from './types'

const MAX_PENDING_TEXT_CHARS = 700
const MAX_PENDING_ARRAY_ITEMS = 8

export type RagPendingClarificationStateDecision = 'use' | 'ignore' | 'split' | 'clarify'

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

function normalizeForPending(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown, maxChars = MAX_PENDING_TEXT_CHARS) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxChars).trim() : ''
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return []

  return value
    .map((item) => readString(item, 160))
    .filter(Boolean)
    .slice(0, MAX_PENDING_ARRAY_ITEMS)
}

function readStateDecision(value: unknown): RagPendingClarificationStateDecision | null {
  return value === 'use' || value === 'ignore' || value === 'split' || value === 'clarify'
    ? value
    : null
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const output: string[] = []

  for (const value of values) {
    const normalized = readString(value, 240)
    const key = normalizeForPending(normalized)
    if (!normalized || !key || seen.has(key)) continue
    seen.add(key)
    output.push(normalized)
  }

  return output
}

export function normalizeRagPendingClarificationState(
  value: unknown
): RagPendingClarificationState | null {
  const record = readRecord(value)
  if (!record) return null

  const originalQuestion = readString(record.originalQuestion ?? record.original_question)
  const clarificationQuestion = readString(
    record.clarificationQuestion ?? record.clarification_question
  )
  if (!originalQuestion || !clarificationQuestion) return null

  const missingSlots = uniqueStrings(readStringArray(record.missingSlots ?? record.missing_slots))
  const requestedMetric = readString(record.requestedMetric ?? record.requested_metric, 80)
  const requestedFacet = readString(record.requestedFacet ?? record.requested_facet, 80)
  const retrievalIntent = readString(record.retrievalIntent ?? record.retrieval_intent, 80)
  const sourcePreference = uniqueStrings(
    readStringArray(record.sourcePreference ?? record.source_preference)
  )
  const riskLevel = readString(record.riskLevel ?? record.risk_level, 80)
  const doNotRetrieveText = uniqueStrings(
    readStringArray(record.doNotRetrieveText ?? record.do_not_retrieve_text)
  )

  return {
    originalQuestion,
    clarificationQuestion,
    ...(missingSlots.length > 0 ? { missingSlots } : {}),
    ...(requestedMetric ? { requestedMetric } : {}),
    ...(requestedFacet ? { requestedFacet } : {}),
    ...(retrievalIntent ? { retrievalIntent } : {}),
    ...(sourcePreference.length > 0 ? { sourcePreference } : {}),
    ...(riskLevel ? { riskLevel } : {}),
    ...(doNotRetrieveText.length > 0 ? { doNotRetrieveText } : {}),
  }
}

export function buildRagPendingClarificationState(input: {
  originalQuestion: string
  clarificationQuestion: string
  missingSlots?: string[]
  requestedMetric?: string
  requestedFacet?: string
  retrievalIntent?: string
  sourcePreference?: string[]
  riskLevel?: string
  doNotRetrieveText?: string[]
}): RagPendingClarificationState | null {
  return normalizeRagPendingClarificationState({
    originalQuestion: input.originalQuestion,
    clarificationQuestion: input.clarificationQuestion,
    missingSlots: input.missingSlots,
    requestedMetric: input.requestedMetric,
    requestedFacet: input.requestedFacet,
    retrievalIntent: input.retrievalIntent,
    sourcePreference: input.sourcePreference,
    riskLevel: input.riskLevel,
    doNotRetrieveText: uniqueStrings([
      input.clarificationQuestion,
      ...(input.doNotRetrieveText ?? []),
    ]),
  })
}

function pendingCandidatesFromMetadata(metadata: unknown) {
  const record = readRecord(metadata)
  if (!record) return []

  const ragFileSearch = readRecord(record.rag_file_search)
  const diagnostics = readRecord(record.diagnostics)
  const fileSearchDiagnostics = readRecord(ragFileSearch?.diagnostics)

  return [
    record.rag_pending_clarification,
    record.pendingClarification,
    record.pending_clarification,
    diagnostics?.pendingClarification,
    diagnostics?.pending_clarification,
    fileSearchDiagnostics?.pendingClarification,
    fileSearchDiagnostics?.pending_clarification,
  ]
}

export function findLatestRagPendingClarificationState(
  history: KnowledgeSearchPlanningTurn[]
): RagPendingClarificationState | null {
  for (const turn of history.slice().reverse()) {
    if (turn.role !== 'assistant') continue

    for (const candidate of pendingCandidatesFromMetadata(turn.metadata)) {
      const pending = normalizeRagPendingClarificationState(candidate)
      if (pending) return pending
    }
  }

  return null
}

function messageLooksLikeFreshQuestion(value: string) {
  const normalized = normalizeForPending(value)
  return (
    /[?？]/.test(value) ||
    /(?:\bne\b|\bnedir\b|\bneler\b|\bhangi\b|\bhangileri\b|\bkac\b|\bkactir\b|\bnerede\b|\bneresi\b|\bnasil\b|\bneden\b|\bniye\b|\bvar mi\b|\bvarmi\b|\bolur mu\b|\bolurmu\b|\bmi\b|\bmu\b|\bmiyim\b|\bmisiniz\b|\bmusunuz\b)/.test(
      normalized
    )
  )
}

function pendingTokens(value: string) {
  return normalizeForPending(value)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
}

function tokensOverlap(left: string, right: string) {
  const leftTokens = pendingTokens(left)
  const rightTokens = pendingTokens(right)

  return leftTokens.some((leftToken) =>
    rightTokens.some(
      (rightToken) =>
        leftToken === rightToken ||
        (Math.min(leftToken.length, rightToken.length) >= 4 &&
          (leftToken.startsWith(rightToken) || rightToken.startsWith(leftToken)))
    )
  )
}

function looksLikeNoProgressReply(value: string) {
  const normalized = normalizeForPending(value)
  return /^(?:bilmiyorum|bilmem|emin degilim|bilemedim|hic fikrim yok|fikrim yok|anlamadim|o degil(?: ya)?|yanlis oldu|kararsizim)$/.test(
    normalized
  )
}

function looksLikeStillAmbiguousReply(value: string) {
  const normalized = normalizeForPending(value)
  return /^(?:hangisi|hangileri)(?: daha)? (?:iyi|mantikli|uygun|avantajli)(?: olur| sizce)?$/.test(
    normalized
  )
}

function hasSlotFillingSignal(input: {
  latestUserMessage: string
  pending: RagPendingClarificationState
}) {
  const normalized = normalizeForPending(input.latestUserMessage)
  const pendingText = [
    input.pending.originalQuestion,
    input.pending.clarificationQuestion,
    input.pending.requestedMetric,
    input.pending.requestedFacet,
    input.pending.retrievalIntent,
    ...(input.pending.missingSlots ?? []),
  ]
    .filter(Boolean)
    .join(' ')

  const scopeSignal =
    /(?:\btum\b|\btumu\b|\bhepsi\b|\btamami\b|\bgenel\b|\bfark etmez\b|\bburslu\b|\bucretli\b|\blisans\b|\bon lisans\b|\bingilizce\b|\bturkce\b|\bbireysel\b|\bkurumsal\b|\bprogram\b|\bbolum\b|\bsecenek)/.test(
      normalized
    )
  const intentPhrase =
    /(?:gormek ist|bilgi almak ist|listele|soyle|goster|yaz|olur)/.test(normalized)

  return (
    tokensOverlap(input.latestUserMessage, pendingText) ||
    (scopeSignal && (tokensOverlap(normalized, pendingText) || intentPhrase))
  )
}

function metricKey(value: string | undefined) {
  const normalized = normalizeForPending(value ?? '')
  if (!normalized) return ''
  if (/(?:fee|price|ucret|fiyat|odeme|payment)/.test(normalized)) return 'fee'
  if (/(?:quota|kontenjan)/.test(normalized)) return 'quota'
  if (/(?:base.*score|taban.*puan)/.test(normalized)) return 'base_score'
  if (/(?:success.*rank|basari.*sira)/.test(normalized)) return 'success_rank'
  if (/(?:location|kampus|yer|adres|ulasim|transport)/.test(normalized)) return 'location'
  if (/(?:duration|sure|kac yil|program_duration)/.test(normalized)) return 'duration'
  if (/(?:internship|staj)/.test(normalized)) return 'internship'
  if (/(?:program.*list|service.*list|liste)/.test(normalized)) return 'list'
  return normalized
}

function extraFacetKeys(value: string) {
  const normalized = normalizeForPending(value)
  const facets = new Set<string>()
  if (/(?:ucretleri|ucreti|ucret nedir|fiyat|kac para|\btl\b|odeme|taksit)/.test(normalized)) {
    facets.add('fee')
  }
  if (/(?:kontenjan)/.test(normalized)) facets.add('quota')
  if (/(?:basari sir|siralama|sirasi)/.test(normalized)) facets.add('success_rank')
  if (/(?:taban puan|puan kac|puan nedir)/.test(normalized)) facets.add('base_score')
  if (/(?:kampus|kampuste|yerleske|nerede|nerde|adres|ulasim|servis)/.test(normalized)) {
    facets.add('location')
  }
  if (/(?:kac yil|sure|hazirlik)/.test(normalized)) facets.add('duration')
  if (/(?:staj)/.test(normalized)) facets.add('internship')
  if (/(?:telefon|whatsapp|iletisim|mail|email)/.test(normalized)) facets.add('contact')
  return facets
}

function hasSplitSignal(input: {
  latestUserMessage: string
  pending: RagPendingClarificationState
}) {
  const normalized = normalizeForPending(input.latestUserMessage)
  const hasConnector = /[,;]|(?:\bve\b|\bayrica\b|\bde\b|\bda\b|\balso\b|\band\b)/.test(
    normalized
  )
  if (!hasConnector) return false

  const requested = new Set([
    metricKey(input.pending.requestedMetric),
    metricKey(input.pending.requestedFacet),
    metricKey(input.pending.retrievalIntent),
  ])
  requested.delete('')
  const extraFacets = extraFacetKeys(input.latestUserMessage)
  for (const facet of extraFacets) {
    if (!requested.has(facet)) return true
  }

  return false
}

function shouldTreatAsClarificationAnswer(input: {
  latestUserMessage: string
  llmTurnType?: string
  llmAction?: string
}) {
  const latest = input.latestUserMessage.trim()
  if (!latest) return false

  if (input.llmTurnType === 'clarification_answer' || input.llmTurnType === 'scope_selection') {
    return true
  }

  if (input.llmAction === 'clarify' || input.llmAction === 'refuse') return false
  if (messageLooksLikeFreshQuestion(latest)) return false

  const tokenCount = normalizeForPending(latest).split(/\s+/).filter(Boolean).length
  if (tokenCount <= 10) return true

  return /(?:istiyorum|isterim|hepsi|tum|tumu|tamami|genel olarak|bireysel|kurumsal|ucretli|burslu|ingilizce|turkce)/.test(
    normalizeForPending(latest)
  )
}

function correctedPendingStateDecision(input: {
  latestUserMessage: string
  pending: RagPendingClarificationState
  stateDecision: RagPendingClarificationStateDecision | null
}) {
  if (
    looksLikeNoProgressReply(input.latestUserMessage) ||
    looksLikeStillAmbiguousReply(input.latestUserMessage)
  ) {
    return 'clarify' as const
  }

  if (input.stateDecision === 'ignore' || input.stateDecision === 'clarify') {
    return input.stateDecision
  }

  if (hasSplitSignal(input)) return 'split' as const
  if (input.stateDecision === 'use' || input.stateDecision === 'split') return input.stateDecision

  if (hasSlotFillingSignal(input)) return 'use' as const

  return null
}

export function resolveRagPendingClarificationFollowup(input: {
  latestUserMessage: string
  pending: RagPendingClarificationState | null | undefined
  llmTurnType?: string
  llmAction?: string
  llmStateDecision?: string
  llmStateConfidence?: number
  llmStateReason?: string
  llmClarificationQuestion?: string
}) {
  const pending = normalizeRagPendingClarificationState(input.pending)
  if (!pending) return null
  const latestUserMessage = readString(input.latestUserMessage)
  if (!latestUserMessage) return null
  const stateDecision = correctedPendingStateDecision({
    latestUserMessage,
    pending,
    stateDecision: readStateDecision(input.llmStateDecision),
  })
  const stateReason = readString(input.llmStateReason, 240)
  const stateConfidence =
    typeof input.llmStateConfidence === 'number' && Number.isFinite(input.llmStateConfidence)
      ? input.llmStateConfidence
      : undefined

  if (stateDecision === 'ignore') return null

  if (stateDecision === 'clarify') {
    return {
      action: 'clarify' as const,
      question: latestUserMessage,
      clarificationQuestion:
        readString(input.llmClarificationQuestion, 240) ||
        'Bir önceki netleştirme için hangi seçeneği kastettiğinizi biraz daha açık yazar mısınız?',
      reason: 'pending_clarification_state_clarify',
      turnType: 'clarification_answer',
      originalUserQuestion: pending.originalQuestion,
      latestUserClarification: latestUserMessage,
      stateDecision,
      ...(stateConfidence !== undefined ? { stateConfidence } : {}),
      ...(stateReason ? { stateReason } : {}),
      pendingClarificationUsed: false,
      consumedPendingState: false,
    }
  }

  if (
    !stateDecision &&
    !shouldTreatAsClarificationAnswer({
      latestUserMessage,
      llmTurnType: input.llmTurnType,
      llmAction: input.llmAction,
    })
  ) {
    return null
  }

  const requestedMetric = pending.requestedMetric || pending.requestedFacet
  const retrievalIntent = pending.retrievalIntent || requestedMetric
  const doNotRetrieveText = uniqueStrings([
    pending.clarificationQuestion,
    ...(pending.doNotRetrieveText ?? []),
  ])
  const split = stateDecision === 'split'

  return {
    action: 'rewrite' as const,
    question: split
      ? `Önceki soru: ${pending.originalQuestion}\nKullanıcının netleştirmesi ve ek sorusu: ${latestUserMessage}`
      : `Önceki soru: ${pending.originalQuestion}\nKullanıcının netleştirmesi: ${latestUserMessage}`,
    reason: split ? 'pending_clarification_state_split' : 'pending_clarification_state_rewrite',
    turnType: split ? 'multi_question' : 'clarification_answer',
    resolvedIntent: `${pending.originalQuestion} — ${latestUserMessage}`,
    originalUserQuestion: pending.originalQuestion,
    latestUserClarification: latestUserMessage,
    shouldRetrieve: true,
    doNotRetrieveText,
    ...(requestedMetric ? { requestedMetric } : {}),
    ...(retrievalIntent ? { retrievalIntent } : {}),
    ...(pending.sourcePreference?.length ? { sourcePreference: pending.sourcePreference } : {}),
    ...(pending.riskLevel ? { riskLevel: pending.riskLevel } : {}),
    stateDecision: stateDecision ?? 'use',
    ...(stateConfidence !== undefined ? { stateConfidence } : {}),
    ...(stateReason ? { stateReason } : {}),
    pendingClarificationUsed: true,
    consumedPendingState: true,
  }
}

export function formatRagPendingClarificationForPrompt(
  pending: RagPendingClarificationState | null | undefined
) {
  const normalized = normalizeRagPendingClarificationState(pending)
  if (!normalized) return 'No pending clarification state.'

  return JSON.stringify(
    {
      original_question: normalized.originalQuestion,
      clarification_question: normalized.clarificationQuestion,
      missing_slots: normalized.missingSlots ?? [],
      requested_metric: normalized.requestedMetric,
      requested_facet: normalized.requestedFacet,
      retrieval_intent: normalized.retrievalIntent,
      source_preference: normalized.sourcePreference ?? [],
      risk_level: normalized.riskLevel,
      do_not_retrieve_text: normalized.doNotRetrieveText ?? [],
    },
    null,
    2
  )
}
