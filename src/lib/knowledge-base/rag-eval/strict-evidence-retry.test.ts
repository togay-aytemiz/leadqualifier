import { describe, expect, it } from 'vitest'

import { buildStrictEvidenceRetryPlan } from './strict-evidence-retry'
import { buildStrictResearchPlan } from './strict-research-plan'
import { planBrochureQuery } from './brochure-query-plan'
import { understandStrictQuestion } from './strict-question-understanding'

function researchPlan(question: string) {
  const understanding = understandStrictQuestion(question)
  return {
    understanding,
    plan: buildStrictResearchPlan({
      question,
      understanding,
      brochurePlan: planBrochureQuery(understanding.normalizedQuestion),
      catalogAnswer: null,
    }),
  }
}

describe('buildStrictEvidenceRetryPlan', () => {
  it('builds a targeted query for the missing transport facet', () => {
    const question = 'Kampüse servis var mı?'
    const { understanding, plan } = researchPlan(question)

    const retry = buildStrictEvidenceRetryPlan({
      question,
      understanding,
      researchPlan: plan,
      criticReason: 'facet_mismatch',
    })

    expect(retry).toMatchObject({
      reason: 'missing_facet_evidence',
      facets: ['transport'],
    })
    expect(retry?.query).toContain('Kampüse servis var mı?')
    expect(retry?.query).toContain('servis')
    expect(retry?.query).toContain('ulaşım')
  })

  it('does not retry contextual no-information repairs', () => {
    const question = 'Kampüste kedi var mı?'
    const { understanding, plan } = researchPlan(question)

    expect(
      buildStrictEvidenceRetryPlan({
        question,
        understanding,
        researchPlan: plan,
        criticReason: 'contextual_no_info',
      })
    ).toBeNull()
  })
})
