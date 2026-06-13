import type { MvpResponseLanguage } from '@/lib/ai/language'

import type { SimpleRagChunk } from './vector-search'

export type SimpleRagDroppedChunk = {
  id: string
  filename: string
  reason: 'other_organization' | 'audience_mismatch'
  matchedText?: string
}

type GuardInput = {
  chunks: SimpleRagChunk[]
  organizationContext?: string | null
  latestUserMessage: string
  standaloneQuery: string
}

const TURKISH_CHAR_MAP: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  i: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
}

function normalize(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[çğıiöşü]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .replace(/&/g, ' ve ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function compact(value: string) {
  return normalize(value).replace(/\s+/g, '')
}

function unique<T>(items: T[]) {
  return Array.from(new Set(items))
}

function organizationAliases(organizationContext?: string | null) {
  const normalized = normalize(organizationContext ?? '')
  if (!normalized) return []

  const aliases = [normalized]
  aliases.push(normalized.replace(/\buniversitesi\b/g, '').trim())
  aliases.push(normalized.replace(/\buniversity\b/g, '').trim())

  return unique(aliases.map(compact).filter((alias) => alias.length >= 5))
}

function extractUniversityNames(value: string) {
  const names = new Set<string>()
  const patterns = [
    /(?:[A-ZÇĞİÖŞÜ][\p{L}.'’&-]*(?:\s+|$)){1,7}(?:Üniversitesi|University)\b/gu,
    /\b(?:[A-ZÇĞİÖŞÜ][\p{L}.'’&-]*\s+){1,7}(?:Technical|Medical|Health|Science|Sciences)\s+University\b/gu,
  ]

  for (const pattern of patterns) {
    for (const match of value.matchAll(pattern)) {
      const text = match[0]?.replace(/\s+/g, ' ').trim()
      if (text) names.add(text)
    }
  }

  return Array.from(names)
}

function isActiveOrganizationName(name: string, aliases: string[]) {
  const normalized = compact(name)
  if (!normalized) return false
  return aliases.some((alias) => normalized.includes(alias) || alias.includes(normalized))
}

function otherOrganizationName(value: string, organizationContext?: string | null) {
  const aliases = organizationAliases(organizationContext)
  if (aliases.length === 0) return null

  return extractUniversityNames(value).find((name) => !isActiveOrganizationName(name, aliases)) ?? null
}

function hasFeeIntent(value: string) {
  return /\b(?:ücret|ucret|fiyat|para|kaç\s*para|kac\s*para|tuition|fee|price)\b/i.test(normalize(value))
}

function hasInternationalAudienceIntent(value: string) {
  return /\b(?:yös|yos|uluslararasi|uluslararası|yabanci|yabancı|foreign|international|international\s+student|usd|dolar|dollar|\$)\b/i.test(normalize(value))
}

function hasInternationalFeeEvidence(value: string) {
  return /\b(?:yös|yos|uluslararasi|uluslararası|yabanci|yabancı|foreign|international|international\s+student|usd|abd\s*dolari|abd\s*doları|dolar|dollar|acente|\$)\b/i.test(
    normalize(value)
  )
}

export function filterSimpleRagChunks(input: GuardInput) {
  const kept: SimpleRagChunk[] = []
  const dropped: SimpleRagDroppedChunk[] = []
  const combinedQuestion = `${input.latestUserMessage}\n${input.standaloneQuery}`
  const feeIntent = hasFeeIntent(combinedQuestion)
  const internationalAudience = hasInternationalAudienceIntent(combinedQuestion)

  for (const chunk of input.chunks) {
    const chunkText = `${chunk.title}\n${chunk.filename}\n${chunk.content}`
    const otherOrganization = otherOrganizationName(chunkText, input.organizationContext)
    if (otherOrganization) {
      dropped.push({
        id: chunk.id,
        filename: chunk.filename,
        reason: 'other_organization',
        matchedText: otherOrganization,
      })
      continue
    }

    if (feeIntent && !internationalAudience && hasInternationalFeeEvidence(chunkText)) {
      dropped.push({
        id: chunk.id,
        filename: chunk.filename,
        reason: 'audience_mismatch',
      })
      continue
    }

    kept.push(chunk)
  }

  return { chunks: kept, dropped }
}

export function answerViolatesOrganizationScope(input: {
  answer: string
  organizationContext?: string | null
}) {
  const matchedText = otherOrganizationName(input.answer, input.organizationContext)
  return matchedText ? { violates: true as const, matchedText } : { violates: false as const }
}

function hasQuotaIntent(value: string) {
  return /\b(?:kontenjan|quota|capacity|başarı\s*sırası|basari\s*sirasi|taban\s*puan|ranking|rank)\b/i.test(
    normalize(value)
  )
}

function hasCampusIntent(value: string) {
  return /\b(?:kampüs|kampus|yerleşke|yerleske|adres|konum|nerede|location|address|campus)\b/i.test(
    normalize(value)
  )
}

function hasDurationIntent(value: string) {
  return /\b(?:kaç\s*yıl|kac\s*yil|kaç\s*yıllık|kac\s*yillik|süre|sure|duration|years?)\b/i.test(
    normalize(value)
  )
}

function hasFacilityIntent(value: string) {
  return /\b(?:laboratuvar|lab|kadavra|mikroskop|uygulama\s*alanı|uygulama\s*alani|cihaz|röntgen|rontgen|mr|tomografi|facility|equipment)\b/i.test(
    normalize(value)
  )
}

function hasHousingTransportIntent(value: string) {
  return /\b(?:yurt|barınma|barinma|konaklama|servis|ring|ulaşım|ulasim|metro|otobüs|otobus|transport|housing|dorm)\b/i.test(
    normalize(value)
  )
}

function retryTermsFor(question: string, language: MvpResponseLanguage) {
  const terms: string[] = []

  if (hasFeeIntent(question)) {
    terms.push(
      language === 'tr'
        ? 'öğrenim ücreti ücret tablosu ücretli burslu indirimli 2025 tanıtım broşürü YKS yerel aday'
        : 'tuition fee table paid scholarship discount 2025 official brochure domestic admissions'
    )
  }

  if (hasQuotaIntent(question)) {
    terms.push(
      language === 'tr'
        ? 'kontenjan taban puan başarı sırası 2025 tanıtım broşürü YKS'
        : 'quota capacity base score ranking 2025 official brochure admissions'
    )
  }

  if (hasCampusIntent(question)) {
    terms.push(language === 'tr' ? 'kampüs yerleşke adres konum' : 'campus location address')
  }

  if (hasDurationIntent(question)) {
    terms.push(language === 'tr' ? 'eğitim süresi kaç yıl' : 'education duration years')
  }

  if (hasFacilityIntent(question)) {
    terms.push(
      language === 'tr'
        ? 'laboratuvar uygulama alanı kadavra mikroskop cihaz imkan'
        : 'laboratory practice area cadaver microscope equipment facility'
    )
  }

  if (hasHousingTransportIntent(question)) {
    terms.push(
      language === 'tr'
        ? 'barınma yurt konaklama ulaşım servis ring'
        : 'housing dormitory accommodation transport shuttle'
    )
  }

  if (terms.length === 0) {
    terms.push(language === 'tr' ? 'resmi bilgi tanıtım broşürü akademik katalog' : 'official information brochure academic catalog')
  }

  return terms.join(' ')
}

export function buildSimpleRagRetryQuery(input: {
  organizationContext?: string | null
  latestUserMessage: string
  standaloneQuery: string
  responseLanguage: MvpResponseLanguage
}) {
  const pieces = [
    input.organizationContext?.trim(),
    input.latestUserMessage.trim(),
    input.standaloneQuery.trim(),
    retryTermsFor(`${input.latestUserMessage}\n${input.standaloneQuery}`, input.responseLanguage),
  ].filter((item): item is string => Boolean(item))

  return unique(pieces).join(' ')
}
