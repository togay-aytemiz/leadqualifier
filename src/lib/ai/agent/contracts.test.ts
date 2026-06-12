import { describe, expect, it } from 'vitest'

import { normalizeAgentBudget, normalizeAgentPlan } from './contracts'

function claim(overrides: Record<string, unknown> = {}) {
  return {
    id: 'claim-1',
    question: 'What information is needed?',
    requiredEvidence: 'direct',
    risk: 'low',
    ...overrides,
  }
}

describe('internal agent contracts', () => {
  it('clamps request budgets to the exact server ceilings', () => {
    expect(
      normalizeAgentBudget({
        maxRounds: 99,
        maxToolCalls: 99,
        maxLatencyMs: 999_999,
        maxInputTokens: 999_999,
        maxOutputTokens: 999_999,
        maxEstimatedCredits: 999_999,
      })
    ).toEqual({
      maxRounds: 3,
      maxToolCalls: 6,
      maxLatencyMs: 30_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 2_000,
      maxEstimatedCredits: 50,
    })
  })

  it('uses defaults for missing and non-finite budgets and clamps finite values to one', () => {
    expect(
      normalizeAgentBudget({
        maxRounds: 0,
        maxToolCalls: -4,
        maxLatencyMs: Number.NaN,
        maxInputTokens: Number.POSITIVE_INFINITY,
        maxEstimatedCredits: 0.2,
      })
    ).toEqual({
      maxRounds: 1,
      maxToolCalls: 1,
      maxLatencyMs: 30_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 2_000,
      maxEstimatedCredits: 1,
    })
  })

  it('rejects a research plan without atomic claims', () => {
    expect(normalizeAgentPlan({ decision: 'research', claims: [], steps: [] })).toBeNull()
  })

  it('accepts a one-question clarification plan with no tool steps', () => {
    const plan = normalizeAgentPlan({
      decision: 'clarify',
      claims: [claim()],
      steps: [],
      clarification: {
        question: 'Which service do you mean?',
        missingSlots: ['service'],
      },
      stopConditions: ['clarification_required'],
    })

    expect(plan?.decision).toBe('clarify')
    expect(plan?.clarification).toEqual({
      question: 'Which service do you mean?',
      missingSlots: ['service'],
    })
  })

  it('normalizes snake_case planner output', () => {
    const plan = normalizeAgentPlan({
      decision: 'research',
      claims: [
        claim({
          id: 'claim-1',
          requiredEvidence: undefined,
          required_evidence: 'authoritative',
        }),
      ],
      steps: [
        {
          id: 'step-1',
          tool: 'lookup',
          claim_ids: ['claim-1'],
          args: { query: 'details' },
          depends_on: [],
        },
        {
          id: 'step-2',
          tool: 'verify',
          claim_ids: ['claim-1'],
          args: {},
          depends_on: ['step-1'],
        },
      ],
      stop_conditions: ['claims_resolved'],
    })

    expect(plan).toMatchObject({
      decision: 'research',
      claims: [{ id: 'claim-1', requiredEvidence: 'authoritative', status: 'unresolved' }],
      steps: [
        { id: 'step-1', claimIds: ['claim-1'], dependsOn: [] },
        { id: 'step-2', claimIds: ['claim-1'], dependsOn: ['step-1'] },
      ],
      stopConditions: ['claims_resolved'],
    })
  })

  it('rejects duplicate claim ids', () => {
    expect(
      normalizeAgentPlan({
        decision: 'direct',
        claims: [claim(), claim({ question: 'A second question' })],
        steps: [],
      })
    ).toBeNull()
  })

  it('rejects duplicate step ids', () => {
    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims: [claim()],
        steps: [
          { id: 'step-1', tool: 'lookup', claimIds: ['claim-1'], args: {}, dependsOn: [] },
          { id: 'step-1', tool: 'verify', claimIds: ['claim-1'], args: {}, dependsOn: [] },
        ],
      })
    ).toBeNull()
  })

  it('validates claims after item 16', () => {
    const claims = Array.from({ length: 17 }, (_, index) =>
      claim({ id: `claim-${index + 1}`, question: `Question ${index + 1}` })
    )
    claims[16] = claim({ id: 'claim-1', question: 'Duplicate after the previous limit' })

    expect(
      normalizeAgentPlan({
        decision: 'direct',
        claims,
        steps: [],
      })
    ).toBeNull()
  })

  it('validates steps after item 16', () => {
    const steps = Array.from({ length: 17 }, (_, index) => ({
      id: `step-${index + 1}`,
      tool: 'lookup',
      claimIds: ['claim-1'],
      args: {},
      dependsOn: [],
    }))
    steps[16] = { ...steps[16], tool: '' }

    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims: [claim()],
        steps,
      })
    ).toBeNull()
  })

  it('rejects steps that reference missing claim ids', () => {
    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims: [claim()],
        steps: [
          {
            id: 'step-1',
            tool: 'lookup',
            claimIds: ['missing-claim'],
            args: {},
            dependsOn: [],
          },
        ],
      })
    ).toBeNull()
  })

  it('rejects steps that reference missing dependency ids', () => {
    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims: [claim()],
        steps: [
          {
            id: 'step-1',
            tool: 'lookup',
            claimIds: ['claim-1'],
            args: {},
            dependsOn: ['missing-step'],
          },
        ],
      })
    ).toBeNull()
  })

  it.each([
    { claimIds: ['claim-1', 42], dependsOn: [] },
    { claimIds: ['claim-1'], dependsOn: [false] },
  ])('rejects non-string step reference entries %#', ({ claimIds, dependsOn }) => {
    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims: [claim()],
        steps: [
          {
            id: 'step-1',
            tool: 'lookup',
            claimIds,
            args: {},
            dependsOn,
          },
        ],
      })
    ).toBeNull()
  })

  it('validates every step reference without imposing an unrelated item cap', () => {
    const claims = Array.from({ length: 17 }, (_, index) =>
      claim({ id: `claim-${index + 1}`, question: `Question ${index + 1}` })
    )

    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims,
        steps: [
          {
            id: 'step-1',
            tool: 'lookup',
            claimIds: claims.map((item) => item.id),
            args: {},
            dependsOn: [],
          },
        ],
      })
    ).not.toBeNull()
  })

  it('rejects invalid claims and steps instead of dropping them', () => {
    expect(
      normalizeAgentPlan({
        decision: 'direct',
        claims: [claim({ question: '   ' })],
        steps: [],
      })
    ).toBeNull()

    expect(
      normalizeAgentPlan({
        decision: 'research',
        claims: [claim()],
        steps: [{ id: 'step-1', tool: '', claimIds: ['claim-1'], args: {}, dependsOn: [] }],
      })
    ).toBeNull()
  })

  it.each([
    { question: '', missingSlots: ['service'] },
    { question: 'Which service?', missingSlots: [] },
    { question: 'Which service?', missing_slots: ['   '] },
  ])('rejects an invalid clarification payload %#', (clarification) => {
    expect(
      normalizeAgentPlan({
        decision: 'clarify',
        claims: [claim()],
        steps: [],
        clarification,
      })
    ).toBeNull()
  })

  it('resets model-supplied claim status to unresolved', () => {
    const plan = normalizeAgentPlan({
      decision: 'direct',
      claims: [claim({ status: 'supported' })],
      steps: [],
    })

    expect(plan?.claims[0]?.status).toBe('unresolved')
  })

  it('clamps confidence and collapses and bounds planner text and arrays', () => {
    const plan = normalizeAgentPlan({
      decision: 'direct',
      claims: [claim({ question: `  ${'q'.repeat(500)}   extra  ` })],
      steps: [],
      reason: '  careful   reasoning  ',
      confidence: 99,
      stopConditions: Array.from(
        { length: 12 },
        (_, index) => `${String(index).padStart(2, '0')}-${'x'.repeat(100)}`
      ),
    })

    expect(plan?.confidence).toBe(1)
    expect(plan?.reason).toBe('careful reasoning')
    expect(plan?.claims[0]?.question).toHaveLength(400)
    expect(plan?.stopConditions).toHaveLength(8)
    expect(plan?.stopConditions[0]).toHaveLength(80)

    expect(
      normalizeAgentPlan({
        decision: 'direct',
        claims: [claim()],
        steps: [],
        confidence: -1,
      })?.confidence
    ).toBe(0)
  })
})
