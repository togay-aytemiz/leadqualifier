import type { StrictCatalogAnswerReason } from './strict-fact-catalog'
import type { RagProviderCitation } from './types'

export type StrictDirectAnswerQualityTier =
  | 'grounded_direct_fact'
  | 'safe_actionable_boundary'
  | 'needs_user_clarification'

export type StrictDirectAnswerQuality = {
  suggestedScore: 7 | 8 | 9
  tier: StrictDirectAnswerQualityTier
  reason: string
}

const HIGH_CONFIDENCE_FACT_REASONS = new Set<string>([
  'catalog_supported_existence',
  'catalog_program_listing',
  'catalog_faculty_listing',
  'catalog_degree_level_listing',
  'catalog_program_distinction_fact',
  'catalog_program_duration_fact',
  'catalog_program_professional_title_fact',
  'catalog_program_fee_fact',
  'catalog_admissions_point_type_fact',
  'catalog_institution_fact',
  'catalog_institution_location_fact',
  'catalog_campus_program_listing',
  'catalog_scholarship_fact',
  'catalog_affiliated_hospital_definition_fact',
  'catalog_clinical_training_fact',
  'catalog_internship_policy_fact',
  'catalog_ergotherapy_training_fact',
  'catalog_campus_life_fact',
  'catalog_housing_agreement_fact',
  'catalog_double_major_fact',
])

function answerContainsNoInfoBoundary(answer: string) {
  return /(?:net|onayli|doğrulanmış|dogrulanmis).{0,80}(?:bilgi|kaynak).{0,80}(?:bulunmamaktadir|bulunmamaktadır|yok|yer almamaktadir|yer almamaktadır)/i.test(
    answer
  )
}

function hasGroundingCitation(citations: RagProviderCitation[]) {
  return citations.some((citation) => citation.providerSourceId && citation.quote?.trim())
}

export function classifyStrictDirectAnswerQuality(input: {
  reason: StrictCatalogAnswerReason | 'unsafe_sensitive_data' | string
  answer: string
  citations: RagProviderCitation[]
  refusal: boolean
}): StrictDirectAnswerQuality {
  if (input.reason === 'catalog_clinical_program_clarification') {
    return {
      suggestedScore: 7,
      tier: 'needs_user_clarification',
      reason: 'The answer correctly asks for the missing program, but the user question remains unresolved.',
    }
  }

  if (input.reason === 'unsafe_sensitive_data') {
    return {
      suggestedScore: 9,
      tier: 'grounded_direct_fact',
      reason: 'The answer applies a deterministic safety boundary before retrieval.',
    }
  }

  if (
    HIGH_CONFIDENCE_FACT_REASONS.has(input.reason) &&
    !input.refusal &&
    hasGroundingCitation(input.citations) &&
    !answerContainsNoInfoBoundary(input.answer)
  ) {
    return {
      suggestedScore: 9,
      tier: 'grounded_direct_fact',
      reason: 'The answer gives a direct supported fact from the strict catalog.',
    }
  }

  return {
    suggestedScore: 8,
    tier: 'safe_actionable_boundary',
    reason:
      'The answer is safe and actionable, but it is a boundary, caveat, or partial fact rather than a complete grounded answer.',
  }
}
