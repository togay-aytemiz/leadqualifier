import type { StrictQuestionUnderstanding } from './strict-question-understanding'
import { normalizeStrictQuestionSearch } from './strict-question-understanding'
import type { RagProviderCitation } from './types'
import type { BehaviorPolicy } from '@/lib/ai/behavior-policy'
import { buildUniversalClaimLedger } from './universal-claim-ledger'

export type StrictClaimSupport = 'supported' | 'unsupported'

export type StrictClaimKind =
  | 'policy_marker'
  | 'critical_value'
  | 'official_identifier'
  | 'contact_value'

export type StrictClaim = {
  kind: StrictClaimKind
  text: string
  terms: string[]
  support: StrictClaimSupport
}

export type StrictClaimLedger = {
  requiresDirectEvidence: boolean
  claims: StrictClaim[]
  supportedClaims: StrictClaim[]
  unsupportedClaims: StrictClaim[]
  universal?: ReturnType<typeof buildUniversalClaimLedger>
}

export type StrictClaimLedgerDiagnostics = {
  requiresDirectEvidence: boolean
  claims: string[]
  supportedClaims: string[]
  unsupportedClaims: string[]
}

const DIRECT_EVIDENCE_INTENTS = new Set<string>([
  'price',
  'quota',
  'existence',
  'listing',
  'location',
  'transport',
  'payment',
  'scholarship',
])

const DIRECT_EVIDENCE_TOPIC_PATTERN =
  /(?:akredit|basvuru|başvuru|belge|burs|cift anadal|çift anadal|cihaz|devamsizlik|devamsızlık|dgs|diploma|e devlet|e-devlet|etkinlik|hazirlik|hazırlık|hastane|iban|kafe|kampus|kampüs|kantin|kayit|kayıt|klinik|konaklama|kontenjan|kredi kart|kutuphane|kütüphane|laboratuvar|mikroskop|odeme|ödeme|online|otopark|puan|siralama|sıralama|servis|spor salonu|staj|taksit|tarih|ucret|ücret|ulasim|ulaşım|uygulama|wifi|wi fi|yatay gecis|yatay geçiş|yemek|yemekhane|yerleske|yerleşke|yurt)/u

const POLICY_MARKERS: Array<{ text: string; pattern: RegExp; terms: string[] }> = [
  {
    text: 'KDV dahil',
    pattern: /\bkdv\b[\s\S]{0,40}\bdahil(?:dir)?\b|\bdahil(?:dir)?\b[\s\S]{0,40}\bkdv\b/u,
    terms: ['kdv', 'dahil'],
  },
  {
    text: 'KDV hariç',
    pattern: /\bkdv\b[\s\S]{0,40}\bharic(?:tir)?\b|\bharic(?:tir)?\b[\s\S]{0,40}\bkdv\b/u,
    terms: ['kdv', 'haric'],
  },
  { text: 'taksit', pattern: /\btaksit\b/u, terms: ['taksit'] },
  { text: 'peşin ödeme', pattern: /\bpesin\b/u, terms: ['pesin'] },
  { text: 'kripto ödeme', pattern: /\bkripto\b/u, terms: ['kripto'] },
  { text: 'IBAN', pattern: /\biban\b/u, terms: ['iban'] },
  { text: 'kredi kartı', pattern: /\bkredi kart\b/u, terms: ['kredi', 'kart'] },
  { text: 'online ödeme/kayıt', pattern: /\bonline\b/u, terms: ['online'] },
  { text: 'e-Devlet', pattern: /\be[-\s]?devlet\b/u, terms: ['devlet'] },
  { text: 'burs kesilir', pattern: /\bkesilir\b/u, terms: ['kesilir'] },
  { text: 'burs kesilmez', pattern: /\bkesilmez\b/u, terms: ['kesilmez'] },
  { text: 'garanti', pattern: /\bgaranti\b/u, terms: ['garanti'] },
  { text: 'iade', pattern: /\biade(?:si)?\b/u, terms: ['iade'] },
  { text: 'zorunlu', pattern: /\bzorunlu\b/u, terms: ['zorunlu'] },
  { text: 'ücretli', pattern: /\bucretli\b/u, terms: ['ucretli'] },
  { text: 'ücretsiz', pattern: /\bucretsiz\b/u, terms: ['ucretsiz'] },
  { text: 'Mavi diploma', pattern: /\bmavi diploma\b/u, terms: ['mavi', 'diploma'] },
]

function citationText(citations: RagProviderCitation[]) {
  return citations
    .map((citation) => [citation.title, citation.url, citation.quote].filter(Boolean).join('\n'))
    .join('\n\n')
}

function answerLooksLikeNoInfo(answer: string) {
  const normalized = normalizeStrictQuestionSearch(answer)
  return /(?:net|acik|dogrudan).{0,80}(?:bilgi|veri|kaynak).{0,80}(?:bulunmamakta|yok|yer almamakta|belirtilmemis)/.test(
    normalized
  )
}

function termLooksSupported(term: string, support: string) {
  if (support.includes(term)) return true
  if (term.length < 6) return false
  return support.includes(term.slice(0, 6))
}

function compactDigits(value: string) {
  return value.replace(/\D/g, '')
}

function valueLooksSupported(value: string, support: string, rawSupport: string) {
  const normalizedValue = normalizeStrictQuestionSearch(value)
  if (normalizedValue && support.includes(normalizedValue)) return true

  const digits = compactDigits(value)
  return Boolean(digits && compactDigits(rawSupport).includes(digits))
}

function supportForTerms(terms: string[], support: string): StrictClaimSupport {
  return terms.every((term) => termLooksSupported(term, support)) ? 'supported' : 'unsupported'
}

function directEvidenceRequired(understanding: StrictQuestionUnderstanding) {
  if (understanding.intents.some((intent) => DIRECT_EVIDENCE_INTENTS.has(intent))) return true
  return DIRECT_EVIDENCE_TOPIC_PATTERN.test(understanding.normalizedSearch)
}

function extractCriticalValues(answer: string) {
  return Array.from(
    new Set(answer.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? [])
  )
}

export function buildStrictClaimLedger(input: {
  question: string
  understanding: StrictQuestionUnderstanding
  answer: string
  citations: RagProviderCitation[]
  behaviorPolicy?: BehaviorPolicy
}): StrictClaimLedger {
  const universal = input.behaviorPolicy
    ? buildUniversalClaimLedger({
        question: input.question,
        answer: input.answer,
        citations: input.citations,
        behaviorPolicy: input.behaviorPolicy,
      })
    : null

  if (!input.answer.trim() || answerLooksLikeNoInfo(input.answer)) {
    return {
      requiresDirectEvidence:
        directEvidenceRequired(input.understanding) || Boolean(universal?.requiresDirectEvidence),
      claims: [],
      supportedClaims: [],
      unsupportedClaims: [],
      ...(universal ? { universal } : {}),
    }
  }

  const rawSupport = citationText(input.citations)
  const support = normalizeStrictQuestionSearch(rawSupport)
  const combined = normalizeStrictQuestionSearch(`${input.question}\n${input.answer}`)
  const claims: StrictClaim[] = []

  for (const marker of POLICY_MARKERS) {
    if (!marker.pattern.test(combined)) continue
    claims.push({
      kind: 'policy_marker',
      text: marker.text,
      terms: marker.terms,
      support: supportForTerms(marker.terms, support),
    })
  }

  for (const value of extractCriticalValues(input.answer)) {
    claims.push({
      kind: 'critical_value',
      text: value,
      terms: [value],
      support: valueLooksSupported(value, support, rawSupport) ? 'supported' : 'unsupported',
    })
  }

  const universalClaims = (universal?.claims ?? []).map((claim): StrictClaim => ({
    kind: claim.kind,
    text: claim.text,
    terms: [claim.text],
    support: claim.support,
  }))
  const allClaims = [...claims, ...universalClaims]

  return {
    requiresDirectEvidence:
      directEvidenceRequired(input.understanding) || Boolean(universal?.requiresDirectEvidence),
    claims: allClaims,
    supportedClaims: allClaims.filter((claim) => claim.support === 'supported'),
    unsupportedClaims: allClaims.filter((claim) => claim.support === 'unsupported'),
    ...(universal ? { universal } : {}),
  }
}

export function summarizeStrictClaimLedger(
  ledger: StrictClaimLedger
): StrictClaimLedgerDiagnostics {
  return {
    requiresDirectEvidence: ledger.requiresDirectEvidence,
    claims: ledger.claims.map((claim) => claim.text),
    supportedClaims: ledger.supportedClaims.map((claim) => claim.text),
    unsupportedClaims: ledger.unsupportedClaims.map((claim) => claim.text),
  }
}
