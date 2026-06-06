import { describe, expect, it } from 'vitest'

import { planBrochureQuery } from './brochure-query-plan'
import { resolveStrictCatalogAnswer } from './strict-fact-catalog'
import { buildStrictResearchPlan } from './strict-research-plan'
import { understandStrictQuestion } from './strict-question-understanding'

function researchPlan(question: string, enableStrictLlmEvaluator = false) {
  const understanding = understandStrictQuestion(question)
  return buildStrictResearchPlan({
    question,
    understanding,
    brochurePlan: planBrochureQuery(understanding.normalizedQuestion),
    catalogAnswer: resolveStrictCatalogAnswer({ question, understanding }),
    enableStrictLlmEvaluator,
  })
}

describe('buildStrictResearchPlan', () => {
  it('routes program fee questions to the brochure table tool with exact row evidence', () => {
    const plan = researchPlan('Tıp ücreti ne kadar?')

    expect(plan).toMatchObject({
      route: 'brochure_table_fact',
      riskLevel: 'high',
      sourceGroups: ['brochure-program-fee-tip'],
    })
    expect(plan.tools).toEqual(
      expect.arrayContaining(['brochure_table', 'file_search', 'claim_ledger', 'strict_answer_critic'])
    )
    expect(plan.requiredEvidence).toContain('exact_table_row')
    expect(plan.expectedClaims).toContain('price')
  })

  it('routes safety questions directly without retrieval tools', () => {
    const plan = researchPlan('Kredi kartı bilgilerimi buraya yazayım mı?')

    expect(plan).toMatchObject({
      route: 'safety_direct',
      riskLevel: 'critical',
      tools: ['strict_safety_guard'],
      requiredEvidence: ['safe_refusal_boundary'],
      sourceGroups: [],
    })
    expect(plan.tools).not.toContain('file_search')
  })

  it('records the strict evaluator in retrieval routes when enabled', () => {
    const plan = researchPlan('Ücretlere KDV dahil mi?', true)

    expect(plan).toMatchObject({
      route: 'payment_policy',
      riskLevel: 'high',
    })
    expect(plan.tools).toEqual(
      expect.arrayContaining([
        'file_search',
        'claim_ledger',
        'strict_answer_critic',
        'strict_llm_evaluator',
      ])
    )
  })

  it('routes deterministic catalog boundaries before file search', () => {
    const plan = researchPlan('Kampüste Wi-Fi var mı?')

    expect(plan).toMatchObject({
      route: 'catalog_direct',
      riskLevel: 'medium',
    })
    expect(plan.tools).toEqual(['strict_fact_catalog'])
    expect(plan.requiredEvidence).toContain('direct_catalog_fact')
  })

  it('records the requested answer facet in expected claims', () => {
    const plan = researchPlan('Ebelik uygulama laboratuvarı var mı?')

    expect(plan.expectedClaims).toContain('facility_resource')
    expect(plan.expectedClaims).not.toContain('program_existence')
  })
})
