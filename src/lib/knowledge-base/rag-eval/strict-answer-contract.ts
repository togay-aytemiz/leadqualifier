import type { StrictQuestionUnderstanding } from './strict-question-understanding'
import { normalizeStrictQuestionSearch } from './strict-question-understanding'
import type { RagProviderCitation } from './types'

export type StrictQuestionFacet =
  | 'program_existence'
  | 'program_listing'
  | 'fee_amount'
  | 'quota'
  | 'location'
  | 'facility_resource'
  | 'clinical_practice'
  | 'transport'
  | 'payment_method'
  | 'payment_policy'
  | 'scholarship_policy'
  | 'credential'
  | 'registration_policy'
  | 'housing'
  | 'campus_life'
  | 'professional_authority'
  | 'reputation'
  | 'safety'
  | 'general'

export type StrictAnswerContract = {
  requiredFacets: StrictQuestionFacet[]
  satisfiedFacets: StrictQuestionFacet[]
  mismatchedFacets: StrictQuestionFacet[]
}

const ACADEMIC_ENTITY_PATTERNS = [
  'tibbi laboratuvar teknikleri',
  'tibbi laboratuvar',
  'tibbi goruntuleme teknikleri',
  'tibbi goruntuleme',
  'tibbi dokumantasyon ve sekreterlik',
  'tibbi dokumantasyon',
  'tibbi veri isleme teknikerligi',
  'tele saglik teknikerligi',
  'dil ve konusma terapisi',
  'fizyoterapi ve rehabilitasyon',
  'beslenme ve diyetetik',
  'saglik yonetimi',
  'ilk ve acil yardim',
  'ameliyathane hizmetleri',
  'eczane hizmetleri',
  'bilgisayar programciligi',
  'grafik tasarim',
  'tip fakultesi',
  'hemsirelik',
  'ebelik',
  'ergoterapi',
  'anestezi',
  'optisyenlik',
  'fizyoterapi',
  'elektronorofizyoloji',
  'biyomedikal cihaz teknolojisi',
]

const FACILITY_RESOURCE_PATTERN =
  /(?:laboratuvar(?:i|lari)?|lab(?:oratuvar)?|mikroskop|kadavra|maket|simulasyon|beceri|cihaz|rontgen|tomografi|\bmr\b|dogumhane|yogun bakim|ameliyathane|ogrenci dinlenme alani)/u

const CLINICAL_PRACTICE_PATTERN =
  /(?:staj|klinik|hastane|hasta basi|hasta bakimi|uygulama|vaka|nobet|ambulans|ameliyat izle|laboratuvara gir|cihaz kullan)/u

const TRANSPORT_PATTERN =
  /(?:servis|ulasim|guzergah|metro|otobus|dolmus|toplu tasima|nasil gid|kampuse yakin|mesafe)/u

const PAYMENT_METHOD_PATTERN = /(?:kripto|iban|kredi kart|online ode|taksit|pesin|odeme kanali|odeme yontemi)/u

const PAYMENT_POLICY_PATTERN = /(?:kdv|ucret|fiyat|iade|hazirlik.*ucret|ucret.*art|kesin mi)/u

const SCHOLARSHIP_POLICY_PATTERN =
  /(?:burs|indirim|tercih bursu|basari bursu|kardes indirimi|sporcu bursu|sosyal destek)/u

const CREDENTIAL_PATTERN = /(?:diploma|denklik|yok|akredit|mavi diploma|kpss|atanabilir|taniniyor)/u

const REGISTRATION_PATTERN = /(?:kayit|belge|e devlet|e-devlet|randevu|basvuru|tarih|saat|dgs|cap|cift anadal|yatay gecis|devamsizlik|hazirlik)/u

const HOUSING_PATTERN = /(?:yurt|konaklama|kyk|apart|kiralik ev)/u

const CAMPUS_LIFE_PATTERN =
  /(?:wifi|wi fi|kafe|kantin|yemek|yemekhane|spor salonu|kutuphane|ders calisma|kulup|etkinlik|guvenlik|revir|otopark|kampus yasam|vejetaryen)/u

const PROFESSIONAL_AUTHORITY_PATTERN =
  /(?:eczaci olur|eczane ac|gozlukcu ac|optik ac|ambulans kullan|doktor der|hacker olur|is garantisi|direkt hastaneye|dogrudan is bul|en zengin)/u

const REPUTATION_PATTERN = /(?:rakip|kotu yorum|eksileri|en kotu|kiyas|olumsuz yorum|dezavantaj)/u

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

export function stripStrictAcademicEntityTerms(value: string) {
  let stripped = normalizeStrictQuestionSearch(value)
  for (const entity of ACADEMIC_ENTITY_PATTERNS) {
    stripped = stripped.replace(new RegExp(`\\b${entity}\\b`, 'gu'), ' ')
  }
  return stripped.replace(/\s+/g, ' ').trim()
}

function pushFacet(facets: StrictQuestionFacet[], facet: StrictQuestionFacet) {
  if (!facets.includes(facet)) facets.push(facet)
}

function hasFacilityResourceFacet(search: string) {
  const stripped = stripStrictAcademicEntityTerms(search)
  return FACILITY_RESOURCE_PATTERN.test(stripped)
}

export function classifyStrictQuestionFacets(
  understanding: StrictQuestionUnderstanding
): StrictQuestionFacet[] {
  const search = understanding.normalizedSearch
  const facets: StrictQuestionFacet[] = []

  if (understanding.safety !== 'none') pushFacet(facets, 'safety')
  if (REPUTATION_PATTERN.test(search)) pushFacet(facets, 'reputation')
  if (PROFESSIONAL_AUTHORITY_PATTERN.test(search)) pushFacet(facets, 'professional_authority')
  if (hasFacilityResourceFacet(search)) pushFacet(facets, 'facility_resource')
  if (CLINICAL_PRACTICE_PATTERN.test(search)) pushFacet(facets, 'clinical_practice')
  if (TRANSPORT_PATTERN.test(search)) pushFacet(facets, 'transport')
  if (PAYMENT_METHOD_PATTERN.test(search)) pushFacet(facets, 'payment_method')
  if (PAYMENT_POLICY_PATTERN.test(search) || understanding.intents.includes('payment')) {
    pushFacet(facets, 'payment_policy')
  }
  if (SCHOLARSHIP_POLICY_PATTERN.test(search)) pushFacet(facets, 'scholarship_policy')
  if (CREDENTIAL_PATTERN.test(search)) pushFacet(facets, 'credential')
  if (REGISTRATION_PATTERN.test(search)) pushFacet(facets, 'registration_policy')
  if (HOUSING_PATTERN.test(search)) pushFacet(facets, 'housing')
  if (CAMPUS_LIFE_PATTERN.test(search)) pushFacet(facets, 'campus_life')
  if (understanding.intents.includes('quota')) pushFacet(facets, 'quota')
  if (understanding.intents.includes('price')) pushFacet(facets, 'fee_amount')
  if (understanding.intents.includes('location')) pushFacet(facets, 'location')
  if (understanding.intents.includes('listing')) pushFacet(facets, 'program_listing')

  if (
    facets.length === 0 &&
    understanding.intents.includes('existence') &&
    understanding.entities.length > 0
  ) {
    pushFacet(facets, 'program_existence')
  }

  if (facets.length === 0) pushFacet(facets, 'general')
  return facets
}

function textHasFacetTerms(
  value: string,
  facet: StrictQuestionFacet,
  understanding: StrictQuestionUnderstanding
) {
  const normalized = normalizeStrictQuestionSearch(value)
  const stripped = stripStrictAcademicEntityTerms(value)

  if (facet === 'facility_resource') return FACILITY_RESOURCE_PATTERN.test(stripped)
  if (facet === 'clinical_practice') return CLINICAL_PRACTICE_PATTERN.test(normalized)
  if (facet === 'transport') return TRANSPORT_PATTERN.test(normalized)
  if (facet === 'payment_method') return PAYMENT_METHOD_PATTERN.test(normalized)
  if (facet === 'payment_policy') return PAYMENT_POLICY_PATTERN.test(normalized)
  if (facet === 'scholarship_policy') return SCHOLARSHIP_POLICY_PATTERN.test(normalized)
  if (facet === 'credential') return CREDENTIAL_PATTERN.test(normalized)
  if (facet === 'registration_policy') return REGISTRATION_PATTERN.test(normalized)
  if (facet === 'housing') return HOUSING_PATTERN.test(normalized)
  if (facet === 'campus_life') return CAMPUS_LIFE_PATTERN.test(normalized)
  if (facet === 'professional_authority') return PROFESSIONAL_AUTHORITY_PATTERN.test(normalized)
  if (facet === 'reputation') return REPUTATION_PATTERN.test(normalized)
  if (facet === 'program_listing') return understanding.entities.length > 0 || /(?:program|bolum|fakulte|liste)/.test(normalized)
  if (facet === 'program_existence') {
    return understanding.entities.some((entity) =>
      normalized.includes(normalizeStrictQuestionSearch(entity.canonicalName))
    )
  }
  if (facet === 'fee_amount') return /(?:ucret|fiyat|tl|\d)/.test(normalized)
  if (facet === 'quota') return /(?:kontenjan|\d)/.test(normalized)
  if (facet === 'location') return /(?:kampus|yerleske|adres|ankara|baglica|balgat|baglum|100 yil)/.test(normalized)
  if (facet === 'safety') return /(?:yazmayin|paylasmayin|yardimci olamam|resmi kanal|guvenli)/.test(normalized)
  return true
}

function facetSatisfiedByAnswerAndEvidence(input: {
  facet: StrictQuestionFacet
  understanding: StrictQuestionUnderstanding
  answer: string
  support: string
}) {
  if (input.facet === 'general') return true
  return (
    textHasFacetTerms(input.answer, input.facet, input.understanding) &&
    textHasFacetTerms(input.support, input.facet, input.understanding)
  )
}

export function buildStrictAnswerContract(input: {
  question: string
  understanding: StrictQuestionUnderstanding
  answer: string
  citations: RagProviderCitation[]
}): StrictAnswerContract {
  const requiredFacets = classifyStrictQuestionFacets(input.understanding)
  if (!input.answer.trim() || answerLooksLikeNoInfo(input.answer)) {
    return {
      requiredFacets,
      satisfiedFacets: [],
      mismatchedFacets: [],
    }
  }

  const support = citationText(input.citations)
  const satisfiedFacets = requiredFacets.filter((facet) =>
    facetSatisfiedByAnswerAndEvidence({
      facet,
      understanding: input.understanding,
      answer: input.answer,
      support,
    })
  )

  return {
    requiredFacets,
    satisfiedFacets,
    mismatchedFacets: requiredFacets.filter(
      (facet) => facet !== 'general' && !satisfiedFacets.includes(facet)
    ),
  }
}
