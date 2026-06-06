import type { BrochureQueryPlan } from './brochure-query-plan'
import { classifyStrictQuestionFacets } from './strict-answer-contract'
import type { StrictCatalogAnswer } from './strict-fact-catalog'
import type { StrictQuestionUnderstanding } from './strict-question-understanding'

export type StrictResearchRoute =
  | 'safety_direct'
  | 'catalog_direct'
  | 'clarification'
  | 'brochure_table_fact'
  | 'scholarship_policy'
  | 'campus_or_contact'
  | 'document_router'
  | 'payment_policy'
  | 'general_file_search'

export type StrictResearchTool =
  | 'strict_safety_guard'
  | 'strict_fact_catalog'
  | 'clarification_gate'
  | 'brochure_table'
  | 'file_search'
  | 'document_router'
  | 'claim_ledger'
  | 'strict_answer_critic'
  | 'strict_llm_evaluator'

export type StrictEvidenceRequirement =
  | 'safe_refusal_boundary'
  | 'direct_catalog_fact'
  | 'clarification_question'
  | 'exact_table_row'
  | 'direct_policy_evidence'
  | 'source_group_filtered_retrieval'
  | 'document_specific_evidence'
  | 'general_grounded_evidence'

export type StrictResearchRiskLevel = 'low' | 'medium' | 'high' | 'critical'

export type StrictResearchPlan = {
  route: StrictResearchRoute
  tools: StrictResearchTool[]
  requiredEvidence: StrictEvidenceRequirement[]
  sourceGroups: string[]
  expectedClaims: string[]
  riskLevel: StrictResearchRiskLevel
}

export type StrictResearchPlanDiagnostics = StrictResearchPlan

function expectedClaims(input: {
  understanding: StrictQuestionUnderstanding
  brochurePlan: BrochureQueryPlan
}) {
  const claims = new Set<string>()
  for (const field of input.brochurePlan.requestedFields) claims.add(field)
  if (asksPaymentPolicy(input.understanding.normalizedSearch)) claims.add('payment_policy')
  if (input.understanding.intents.includes('existence')) claims.add('existence')
  if (input.understanding.intents.includes('listing')) claims.add('listing')
  if (input.understanding.intents.includes('payment')) claims.add('payment_policy')
  if (input.understanding.intents.includes('scholarship')) claims.add('scholarship_policy')
  if (input.understanding.intents.includes('location')) claims.add('location')
  if (input.understanding.intents.includes('transport')) claims.add('transport')
  for (const facet of classifyStrictQuestionFacets(input.understanding)) claims.add(facet)
  return Array.from(claims)
}

function asksPaymentPolicy(search: string) {
  return /(?:kdv|taksit|pesin|iade|kripto|iban|kredi kart|online ode|odeme kanali|odeme yontemi)/.test(
    search
  )
}

function withStrictEvaluatorTool(
  tools: StrictResearchTool[],
  enableStrictLlmEvaluator: boolean | undefined
) {
  return enableStrictLlmEvaluator
    ? [...tools, 'strict_llm_evaluator' as const]
    : tools
}

export function buildStrictResearchPlan(input: {
  question: string
  understanding: StrictQuestionUnderstanding
  brochurePlan: BrochureQueryPlan
  catalogAnswer: StrictCatalogAnswer | null
  enableStrictLlmEvaluator?: boolean
}): StrictResearchPlan {
  const baseClaims = expectedClaims(input)

  if (input.understanding.safety !== 'none') {
    return {
      route: 'safety_direct',
      tools: ['strict_safety_guard'],
      requiredEvidence: ['safe_refusal_boundary'],
      sourceGroups: [],
      expectedClaims: baseClaims,
      riskLevel: 'critical',
    }
  }

  if (input.catalogAnswer) {
    return {
      route: 'catalog_direct',
      tools: ['strict_fact_catalog'],
      requiredEvidence: ['direct_catalog_fact'],
      sourceGroups: [],
      expectedClaims: baseClaims,
      riskLevel: input.catalogAnswer.refusal ? 'medium' : 'low',
    }
  }

  if (input.brochurePlan.clarification) {
    return {
      route: 'clarification',
      tools: ['clarification_gate'],
      requiredEvidence: ['clarification_question'],
      sourceGroups: [],
      expectedClaims: baseClaims,
      riskLevel: 'low',
    }
  }

  if (asksPaymentPolicy(input.understanding.normalizedSearch)) {
    return {
      route: 'payment_policy',
      tools: withStrictEvaluatorTool(
        ['file_search', 'claim_ledger', 'strict_answer_critic'],
        input.enableStrictLlmEvaluator
      ),
      requiredEvidence: ['direct_policy_evidence'],
      sourceGroups: input.brochurePlan.sourceGroups,
      expectedClaims: baseClaims,
      riskLevel: 'high',
    }
  }

  if (input.brochurePlan.intent === 'brochure_table_fact') {
    return {
      route: 'brochure_table_fact',
      tools: withStrictEvaluatorTool(
        ['brochure_table', 'file_search', 'claim_ledger', 'strict_answer_critic'],
        input.enableStrictLlmEvaluator
      ),
      requiredEvidence: ['exact_table_row'],
      sourceGroups: input.brochurePlan.sourceGroups,
      expectedClaims: baseClaims,
      riskLevel: 'high',
    }
  }

  if (input.brochurePlan.intent === 'document_router') {
    return {
      route: 'document_router',
      tools: withStrictEvaluatorTool(
        ['document_router', 'file_search', 'claim_ledger', 'strict_answer_critic'],
        input.enableStrictLlmEvaluator
      ),
      requiredEvidence: ['document_specific_evidence'],
      sourceGroups: input.brochurePlan.sourceGroups,
      expectedClaims: baseClaims,
      riskLevel: 'medium',
    }
  }

  if (input.understanding.intents.includes('payment')) {
    return {
      route: 'payment_policy',
      tools: withStrictEvaluatorTool(
        ['file_search', 'claim_ledger', 'strict_answer_critic'],
        input.enableStrictLlmEvaluator
      ),
      requiredEvidence: ['direct_policy_evidence'],
      sourceGroups: input.brochurePlan.sourceGroups,
      expectedClaims: baseClaims,
      riskLevel: 'high',
    }
  }

  if (input.brochurePlan.intent === 'brochure_scholarship') {
    return {
      route: 'scholarship_policy',
      tools: withStrictEvaluatorTool(
        ['file_search', 'claim_ledger', 'strict_answer_critic'],
        input.enableStrictLlmEvaluator
      ),
      requiredEvidence: ['direct_policy_evidence'],
      sourceGroups: input.brochurePlan.sourceGroups,
      expectedClaims: baseClaims,
      riskLevel: 'high',
    }
  }

  if (
    input.brochurePlan.intent === 'brochure_campus_contact' ||
    input.brochurePlan.intent === 'website_contact'
  ) {
    return {
      route: 'campus_or_contact',
      tools: withStrictEvaluatorTool(
        ['file_search', 'claim_ledger', 'strict_answer_critic'],
        input.enableStrictLlmEvaluator
      ),
      requiredEvidence: ['source_group_filtered_retrieval'],
      sourceGroups: input.brochurePlan.sourceGroups,
      expectedClaims: baseClaims,
      riskLevel: 'medium',
    }
  }

  return {
    route: 'general_file_search',
    tools: withStrictEvaluatorTool(
      ['file_search', 'claim_ledger', 'strict_answer_critic'],
      input.enableStrictLlmEvaluator
    ),
    requiredEvidence: ['general_grounded_evidence'],
    sourceGroups: input.brochurePlan.sourceGroups,
    expectedClaims: baseClaims,
    riskLevel: 'medium',
  }
}

export function summarizeStrictResearchPlan(
  plan: StrictResearchPlan
): StrictResearchPlanDiagnostics {
  return plan
}
