import { classifyStrictQuestionFacets, type StrictQuestionFacet } from './strict-answer-contract'
import type { StrictAnswerCriticReason } from './strict-answer-critic'
import type { StrictQuestionUnderstanding } from './strict-question-understanding'
import type { StrictResearchPlan } from './strict-research-plan'

export type StrictEvidenceRetryReason = 'missing_facet_evidence' | 'missing_direct_evidence'

export type StrictEvidenceRetryPlan = {
  reason: StrictEvidenceRetryReason
  query: string
  facets: StrictQuestionFacet[]
  sourceGroups: string[]
  maxResults: number
}

const RETRYABLE_CRITIC_REASONS = new Set<StrictAnswerCriticReason>([
  'facet_mismatch',
  'unsupported_institutional_claim',
  'unsupported_positive_claim',
  'insufficient_answer',
])

const FACET_RETRY_TERMS: Partial<Record<StrictQuestionFacet, string[]>> = {
  facility_resource: ['laboratuvar', 'simülasyon', 'uygulama alanı', 'cihaz', 'fiziksel imkan'],
  clinical_practice: ['staj', 'klinik uygulama', 'hastane uygulaması', 'hasta başı eğitim'],
  transport: ['servis', 'ulaşım', 'güzergah', 'toplu taşıma'],
  payment_method: ['ödeme yöntemi', 'kredi kartı', 'taksit', 'IBAN', 'online ödeme'],
  payment_policy: ['ödeme koşulu', 'KDV', 'ücret', 'iade', 'hazırlık ücreti'],
  scholarship_policy: ['burs', 'indirim', 'tercih bursu', 'başarı bursu', 'koşul'],
  credential: ['diploma', 'denklik', 'akreditasyon', 'YÖK', 'mavi diploma'],
  registration_policy: ['kayıt', 'belge', 'e-Devlet', 'randevu', 'başvuru'],
  housing: ['yurt', 'konaklama', 'KYK', 'özel yurt', 'başvuru'],
  campus_life: ['kampüs yaşamı', 'yemekhane', 'kafe', 'Wi-Fi', 'kulüp', 'etkinlik'],
  location: ['kampüs', 'yerleşke', 'adres', 'konum'],
  quota: ['kontenjan'],
  fee_amount: ['ücret', 'fiyat', 'TL'],
  program_listing: ['program listesi', 'bölümler', 'fakülteler'],
  program_existence: ['program', 'bölüm', 'fakülte', 'var mı'],
}

function retryableFacets(understanding: StrictQuestionUnderstanding) {
  const facets = classifyStrictQuestionFacets(understanding).filter((facet) => facet !== 'general')
  if (facets.length <= 1) return facets

  // Location often describes where the real subject applies ("kampüse servis", "hastaneye ulaşım").
  // Keep retries focused on the stronger missing facet instead of letting nearby location facts pass.
  if (facets.includes('location')) {
    const withoutLocation = facets.filter((facet) => facet !== 'location')
    if (withoutLocation.length > 0) return withoutLocation
  }

  return facets
}

function facetTerms(facets: StrictQuestionFacet[]) {
  return Array.from(new Set(facets.flatMap((facet) => FACET_RETRY_TERMS[facet] ?? [facet])))
}

export function buildStrictEvidenceRetryPlan(input: {
  question: string
  understanding: StrictQuestionUnderstanding
  researchPlan: StrictResearchPlan
  criticReason: StrictAnswerCriticReason
}): StrictEvidenceRetryPlan | null {
  if (!RETRYABLE_CRITIC_REASONS.has(input.criticReason)) return null
  if (input.researchPlan.route === 'safety_direct' || input.researchPlan.route === 'clarification') {
    return null
  }

  const facets = retryableFacets(input.understanding)
  if (facets.length === 0) return null

  const terms = facetTerms(facets)
  const reason: StrictEvidenceRetryReason =
    input.criticReason === 'facet_mismatch' || facets.length > 0
      ? 'missing_facet_evidence'
      : 'missing_direct_evidence'

  return {
    reason,
    facets,
    sourceGroups: input.researchPlan.sourceGroups,
    maxResults: input.researchPlan.riskLevel === 'high' ? 20 : 12,
    query: [
      input.question.trim(),
      `Doğrudan kanıt ara: ${terms.join(', ')}.`,
      'Komşu program/kurum bilgisini değil, kullanıcının sorduğu başlığı destekleyen satır veya cümleyi bul.',
    ].join('\n'),
  }
}
