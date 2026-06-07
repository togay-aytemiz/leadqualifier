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
  it('routes catalog-covered program fee questions directly without retrieval tools', () => {
    const plan = researchPlan('Tıp ücreti ne kadar?')

    expect(plan).toMatchObject({
      route: 'catalog_direct',
      riskLevel: 'low',
      sourceGroups: [],
    })
    expect(plan.tools).toEqual(['strict_fact_catalog'])
    expect(plan.requiredEvidence).toContain('direct_catalog_fact')
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

  it('keeps catalog-covered payment policy boundaries direct even when the evaluator is enabled', () => {
    const plan = researchPlan('Ücretlere KDV dahil mi?', true)

    expect(plan).toMatchObject({
      route: 'catalog_direct',
      riskLevel: 'medium',
    })
    expect(plan.tools).toEqual(['strict_fact_catalog'])
    expect(plan.tools).not.toContain('strict_llm_evaluator')
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
