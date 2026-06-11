import { describe, expect, it, vi } from 'vitest'
import { runStrictLlmResearchPlanner } from './strict-llm-research-planner'

describe('runStrictLlmResearchPlanner', () => {
  it('returns a bounded multi-hop retrieval plan from LLM JSON', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              route: 'multi_hop_file_search',
              reason: 'Question asks for separate scholarship and duration facts.',
              required_evidence: ['program variant row', 'education duration sentence'],
              confidence: 0.87,
              hops: [
                {
                  query: 'Tıp Fakültesi Burslu program satırı',
                  source_groups: [' brochure-program-fee-tip ', 'brochure-program-fee-tip'],
                  purpose: 'Find the exact brochure program variant row.',
                  max_results: 9,
                },
                {
                  query: 'Tıp Fakültesi eğitim süresi kaç yıl',
                  source_groups: ['admissions'],
                  purpose: 'Find duration evidence.',
                  max_results: 20,
                },
                {
                  query: 'ignored extra hop',
                  source_groups: ['general'],
                  purpose: 'Should be capped out.',
                },
                {
                  query: 'ignored fourth hop',
                  source_groups: ['general'],
                  purpose: 'Should be capped out.',
                },
              ],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 70, completion_tokens: 30, total_tokens: 100 },
    }))

    const result = await runStrictLlmResearchPlanner({
      question: 'Tıp Fakültesinde burslu program ve eğitim süresi var mı?',
      normalizedQuestion: 'Tıp Fakültesinde burslu program ve eğitim süresi var mı?',
      deterministicPlan: {
        route: 'general_file_search',
        tools: ['file_search', 'claim_ledger', 'strict_answer_critic'],
        requiredEvidence: ['general_grounded_evidence'],
        sourceGroups: [],
        expectedClaims: ['program_existence'],
        riskLevel: 'medium',
      },
      brochureSourceGroups: ['brochure-program-fee-tip'],
      model: 'gpt-4o-mini',
      createCompletion,
    })

    expect(createCompletion).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      route: 'multi_hop_file_search',
      reason: 'Question asks for separate scholarship and duration facts.',
      requiredEvidence: ['program variant row', 'education duration sentence'],
      confidence: 0.87,
      usage: {
        inputTokens: 70,
        outputTokens: 30,
        totalTokens: 100,
      },
      hops: [
        {
          query: 'Tıp Fakültesi Burslu program satırı',
          sourceGroups: ['brochure-program-fee-tip'],
          purpose: 'Find the exact brochure program variant row.',
          maxResults: 9,
        },
        {
          query: 'Tıp Fakültesi eğitim süresi kaç yıl',
          sourceGroups: ['admissions'],
          purpose: 'Find duration evidence.',
          maxResults: 20,
        },
        {
          query: 'ignored extra hop',
          sourceGroups: ['general'],
          purpose: 'Should be capped out.',
        },
      ],
    })
  })

  it('returns an off-topic boundary plan without retrieval hops', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              route: 'off_topic_boundary',
              reason: 'The user asks for general advice outside the approved business scope.',
              required_evidence: ['safe_refusal_boundary'],
              confidence: 0.92,
              hops: [],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 60, completion_tokens: 18, total_tokens: 78 },
    }))

    const result = await runStrictLlmResearchPlanner({
      question: 'vergi nasıl verilir',
      normalizedQuestion: 'vergi nasıl verilir?',
      deterministicPlan: {
        route: 'general_file_search',
        tools: ['file_search', 'claim_ledger', 'strict_answer_critic'],
        requiredEvidence: ['general_grounded_evidence'],
        sourceGroups: [],
        expectedClaims: ['general'],
        riskLevel: 'medium',
      },
      brochureSourceGroups: [],
      model: 'gpt-4o-mini',
      createCompletion,
    })

    expect(result).toMatchObject({
      route: 'off_topic_boundary',
      reason: 'The user asks for general advice outside the approved business scope.',
      requiredEvidence: ['safe_refusal_boundary'],
      confidence: 0.92,
      hops: [],
    })
  })
})
