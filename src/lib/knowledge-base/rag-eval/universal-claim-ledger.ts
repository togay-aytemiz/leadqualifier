import type {
  BehaviorPolicy,
  BehaviorPolicyEvidenceRequirement,
} from '@/lib/ai/behavior-policy'
import type { RagProviderCitation } from './types'

export type UniversalClaimKind =
  | 'policy_marker'
  | 'critical_value'
  | 'official_identifier'
  | 'contact_value'

export type UniversalClaim = {
  kind: UniversalClaimKind
  text: string
  evidenceCategory?: BehaviorPolicyEvidenceRequirement
  support: 'supported' | 'unsupported'
}

export type UniversalClaimLedger = {
  requiresDirectEvidence: boolean
  evidenceRequiredFor: BehaviorPolicyEvidenceRequirement[]
  claims: UniversalClaim[]
  supportedClaims: UniversalClaim[]
  unsupportedClaims: UniversalClaim[]
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

function normalizeClaimText(value: string) {
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

function citationText(citations: RagProviderCitation[]) {
  return citations
    .map((citation) => [citation.title, citation.url, citation.quote].filter(Boolean).join('\n'))
    .join('\n\n')
}

function categoryPattern(category: BehaviorPolicyEvidenceRequirement) {
  switch (category) {
    case 'pricing':
      return /(?:ucret|fiyat|kac para|kac tl|tutar|tl\b|price|pricing)/
    case 'discounts':
      return /(?:burs|indirim|discount|scholarship)/
    case 'quotas':
      return /(?:kontenjan|quota)/
    case 'dates':
      return /(?:tarih|son gun|deadline|saat|gun|ay|yil|date)/
    case 'payments':
      return /(?:odeme|iban|taksit|kdv|kredi kart|pesin|payment)/
    case 'programs':
      return /(?:program|bolum|fakulte|myo|hizmet|service)/
    case 'locations':
      return /(?:kampus|yerleske|adres|ulasim|yurt|konaklama|location)/
    case 'contacts':
      return /(?:iletisim|telefon|whatsapp|mail|email|e-posta|contact)/
    case 'credentials':
      return /(?:akredit|denklik|diploma|taninma|yok|credential)/
    case 'clinical_training':
      return /(?:staj|klinik|hastane|laboratuvar|uygulama|clinical|internship|lab)/
    case 'availability':
      return /(?:musait|availability|randevu)/
    case 'legal_policy':
      return /(?:politika|kosul|kural|yonetmelik|yonerge|policy)/
  }
}

function relevantEvidenceCategories(input: {
  question: string
  answer: string
  behaviorPolicy: BehaviorPolicy
}) {
  const combined = normalizeClaimText(`${input.question}\n${input.answer}`)
  return input.behaviorPolicy.evidenceRequiredFor.filter((category) =>
    categoryPattern(category).test(combined)
  )
}

function extractCriticalValues(answer: string) {
  return Array.from(
    new Set(answer.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? [])
  )
}

function extractIbans(answer: string) {
  return Array.from(new Set(answer.match(/\bTR\d{2}(?:\s?\d{4}){5}\s?\d{2}\b/gi) ?? []))
}

function extractContacts(answer: string) {
  return Array.from(
    new Set([
      ...(answer.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
      ...(answer.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? []),
    ])
  )
}

function valueSupported(value: string, support: string, rawSupport: string) {
  const normalized = normalizeClaimText(value)
  if (normalized && support.includes(normalized)) return true
  const digits = compactDigits(value)
  return Boolean(digits && compactDigits(rawSupport).includes(digits))
}

function markerSupported(terms: string[], support: string) {
  return terms.every((term) => support.includes(term))
}

const POLICY_MARKERS: Array<{
  text: string
  pattern: RegExp
  terms: string[]
  evidenceCategory: BehaviorPolicyEvidenceRequirement
}> = [
  {
    text: 'KDV dahil',
    pattern: /\bkdv\b[\s\S]{0,40}\bdahil(?:dir)?\b|\bdahil(?:dir)?\b[\s\S]{0,40}\bkdv\b/u,
    terms: ['kdv', 'dahil'],
    evidenceCategory: 'payments',
  },
  { text: 'taksit', pattern: /\btaksit\b/u, terms: ['taksit'], evidenceCategory: 'payments' },
  { text: 'IBAN', pattern: /\biban\b/u, terms: ['iban'], evidenceCategory: 'payments' },
  { text: 'garanti', pattern: /\bgaranti\b/u, terms: ['garanti'], evidenceCategory: 'legal_policy' },
  { text: 'kesin sonuç', pattern: /\bkesin\b/u, terms: ['kesin'], evidenceCategory: 'legal_policy' },
  { text: 'online ödeme/kayıt', pattern: /\bonline\b/u, terms: ['online'], evidenceCategory: 'payments' },
]

export function buildUniversalClaimLedger(input: {
  question: string
  answer: string
  citations: RagProviderCitation[]
  behaviorPolicy: BehaviorPolicy
}): UniversalClaimLedger {
  const rawSupport = citationText(input.citations)
  const support = normalizeClaimText(rawSupport)
  const combined = normalizeClaimText(`${input.question}\n${input.answer}`)
  const evidenceRequiredFor = relevantEvidenceCategories(input)
  const claims: UniversalClaim[] = []

  for (const marker of POLICY_MARKERS) {
    if (!marker.pattern.test(combined)) continue
    claims.push({
      kind: 'policy_marker',
      text: marker.text,
      evidenceCategory: marker.evidenceCategory,
      support: markerSupported(marker.terms, support) ? 'supported' : 'unsupported',
    })
  }

  for (const value of extractCriticalValues(input.answer)) {
    claims.push({
      kind: 'critical_value',
      text: value,
      support: valueSupported(value, support, rawSupport) ? 'supported' : 'unsupported',
    })
  }

  for (const iban of extractIbans(input.answer)) {
    claims.push({
      kind: 'official_identifier',
      text: iban,
      evidenceCategory: 'payments',
      support: valueSupported(iban, support, rawSupport) ? 'supported' : 'unsupported',
    })
  }

  for (const contact of extractContacts(input.answer)) {
    claims.push({
      kind: 'contact_value',
      text: contact,
      evidenceCategory: 'contacts',
      support: valueSupported(contact, support, rawSupport) ? 'supported' : 'unsupported',
    })
  }

  return {
    requiresDirectEvidence: evidenceRequiredFor.length > 0,
    evidenceRequiredFor,
    claims,
    supportedClaims: claims.filter((claim) => claim.support === 'supported'),
    unsupportedClaims: claims.filter((claim) => claim.support === 'unsupported'),
  }
}

export function summarizeUniversalClaimLedger(ledger: UniversalClaimLedger) {
  return {
    requiresDirectEvidence: ledger.requiresDirectEvidence,
    evidenceRequiredFor: ledger.evidenceRequiredFor,
    claims: ledger.claims.map((claim) => claim.text),
    supportedClaims: ledger.supportedClaims.map((claim) => claim.text),
    unsupportedClaims: ledger.unsupportedClaims.map((claim) => claim.text),
  }
}
