import type { AgentPlan, AgentRequest } from './contracts'

export type AgentPlanReviewIssueCode =
  | 'invalid_plan_shape'
  | 'planner_validation_error'
  | 'pending_state_reasked'
  | 'pending_state_missing_typed_state'
  | 'stale_pending_state_clarified'
  | 'off_topic_clarified'
  | 'facility_or_policy_refused'
  | 'document_evidence_tool_missing'

export type AgentPlanReviewIssue = {
  code: AgentPlanReviewIssueCode
  message: string
}

export type AgentPlanReview = {
  issues: AgentPlanReviewIssue[]
  shouldRepair: boolean
}

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

const SLOT_FILLER_TERMS = [
  'all',
  'both',
  'hepsi',
  'tum',
  'tumu',
  'tamami',
  'fark etmez',
  'burslu',
  'ucretli',
  'indirimli',
  'lisans',
  'on lisans',
  'associate',
  'undergraduate',
  'paid',
  'scholarship',
]

const FRESH_TURN_MARKERS = [
  'peki',
  'hayir',
  'hayır',
  'yok',
  'no',
  'never mind',
  'bosver',
  'boşver',
  'onu bosver',
  'onu boşver',
  'disregard',
]

const QUESTION_WORDS = [
  'mi',
  'mu',
  'mı',
  'mü',
  'nedir',
  'ne',
  'nasil',
  'nasıl',
  'hangi',
  'kac',
  'kaç',
  'nerede',
  'nerde',
  'nereye',
  'var mi',
  'var mı',
  'olur mu',
  'how',
  'what',
  'where',
  'which',
]

const OFF_TOPIC_TERMS = [
  'weather',
  'hava',
  'recipe',
  'tarif',
  'kahve',
  'astroloji',
  'burc',
  'burç',
  'fal',
  'sevgili',
  'relationship',
  'tutoring',
  'matematik',
  'ders calistir',
  'ders çalıştır',
]

const DOCUMENT_EVIDENCE_TERMS = [
  'hospital',
  'hastane',
  'clinical',
  'klinik',
  'internship',
  'staj',
  'laboratory',
  'lab',
  'laboratuvar',
  'cadaver',
  'kadavra',
  'facility',
  'tesis',
  'practice',
  'uygulama',
  'accreditation',
  'akredit',
  'recognition',
  'denklik',
  'diploma',
  'housing',
  'yurt',
  'transport',
  'ulasim',
  'ulaşım',
  'service',
  'servis',
  'contact',
  'iletisim',
  'iletişim',
  'campus',
  'kampus',
  'kampüs',
  'address',
  'adres',
  'location',
  'university type',
  'institution type',
  'vakif',
  'vakıf',
  'devlet',
  'private',
  'public',
  'ankara',
  'city',
  'sehir',
  'şehir',
  'policy',
  'yonerge',
  'yönerge',
  'yonetmelik',
  'yönetmelik',
]

function normalizeText(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function includesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeText(term)))
}

function planTools(plan: AgentPlan | null | undefined) {
  return new Set((plan?.steps ?? []).map((step) => step.tool))
}

function isPending(request: AgentRequest) {
  return request.conversationState?.status === 'pending_clarification'
}

function latestLooksLikeQuestion(normalized: string) {
  return normalized.includes('?') || includesAny(normalized, QUESTION_WORDS)
}

function latestHasFreshTurnMarker(normalized: string) {
  return includesAny(normalized, FRESH_TURN_MARKERS)
}

function latestLikelyFillsPendingSlot(request: AgentRequest) {
  if (!isPending(request)) return false
  const latest = normalizeText(request.latestUserMessage)
  if (!latest) return false
  if (latestHasFreshTurnMarker(latest) && latestLooksLikeQuestion(latest)) return false

  const missingSlots = request.conversationState?.missingSlots ?? []
  if (missingSlots.some((slot) => /scope|variant|row|type|tur|tür/i.test(slot))) {
    if (includesAny(latest, SLOT_FILLER_TERMS)) return true
    return latest.length <= 80 && !latestLooksLikeQuestion(latest)
  }
  if (missingSlots.some((slot) => /program|service|entity|subject|bolum|bölüm/i.test(slot))) {
    return latest.length <= 80 && !latestLooksLikeQuestion(latest)
  }

  return latest.length <= 60 && !latestLooksLikeQuestion(latest)
}

function latestLooksFreshStandalone(request: AgentRequest) {
  if (!isPending(request)) return false
  const latest = normalizeText(request.latestUserMessage)
  if (!latest) return false
  if (latestHasFreshTurnMarker(latest) && latestLooksLikeQuestion(latest)) return true
  if (latest.length > 80 && latestLooksLikeQuestion(latest)) return true
  return latestLooksLikeQuestion(latest) && !latestLikelyFillsPendingSlot(request)
}

function isOffTopicRequest(request: AgentRequest) {
  const latest = normalizeText(request.latestUserMessage)
  const policyHints = request.behaviorPolicy.outOfScopeHints.map(normalizeText)
  return includesAny(latest, [...OFF_TOPIC_TERMS, ...policyHints])
}

function needsDocumentEvidence(request: AgentRequest) {
  const latest = normalizeText(request.latestUserMessage)
  return includesAny(latest, DOCUMENT_EVIDENCE_TERMS)
}

function addIssue(issues: AgentPlanReviewIssue[], code: AgentPlanReviewIssueCode, message: string) {
  if (issues.some((issue) => issue.code === code)) return
  issues.push({ code, message })
}

export function reviewAgentPlan(input: {
  request: AgentRequest
  plan: AgentPlan | null
  validationError?: string | null
}): AgentPlanReview {
  const issues: AgentPlanReviewIssue[] = []
  const { request, plan } = input

  if (!plan) {
    addIssue(
      issues,
      input.validationError ? 'planner_validation_error' : 'invalid_plan_shape',
      input.validationError
        ? `Planner output failed validation: ${input.validationError}.`
        : 'Planner output could not be normalized into the internal plan schema.'
    )
    if (isPending(request) && latestLikelyFillsPendingSlot(request)) {
      addIssue(
        issues,
        'pending_state_reasked',
        'Latest message likely fills a pending clarification slot; repair should resolve pending state instead of asking again.'
      )
    }
    if (latestLooksFreshStandalone(request)) {
      addIssue(
        issues,
        'stale_pending_state_clarified',
        'Latest message looks like a fresh standalone question; repair should ignore stale pending state.'
      )
    }
    return { issues, shouldRepair: true }
  }

  const tools = planTools(plan)
  if (isPending(request) && latestLikelyFillsPendingSlot(request)) {
    if (plan.decision === 'clarify') {
      addIssue(
        issues,
        'pending_state_reasked',
        'Latest message likely fills a pending clarification slot; do not repeat the same clarification.'
      )
    }
    if (plan.decision === 'research' && !tools.has('internal.typed_state')) {
      addIssue(
        issues,
        'pending_state_missing_typed_state',
        'Pending clarification state should be resolved with internal.typed_state before evidence lookup.'
      )
    }
  }

  if (plan.decision === 'clarify' && latestLooksFreshStandalone(request)) {
    addIssue(
      issues,
      'stale_pending_state_clarified',
      'Latest message looks like a fresh standalone question; ignore stale pending state instead of clarifying it.'
    )
  }

  if (plan.decision === 'clarify' && isOffTopicRequest(request)) {
    addIssue(
      issues,
      'off_topic_clarified',
      'Off-topic requests should be refused or redirected, not clarified.'
    )
  }

  if (plan.decision === 'refuse' && needsDocumentEvidence(request) && !isOffTopicRequest(request)) {
    addIssue(
      issues,
      'facility_or_policy_refused',
      'Facility, policy, clinical, campus, contact, or document-backed institutional questions are in scope and should be researched.'
    )
  }

  if (plan.decision === 'research' && needsDocumentEvidence(request) && !tools.has('internal.file_search')) {
    addIssue(
      issues,
      'document_evidence_tool_missing',
      'This claim likely needs approved document evidence; include internal.file_search unless a table row is clearly sufficient.'
    )
  }

  return { issues, shouldRepair: issues.length > 0 }
}
