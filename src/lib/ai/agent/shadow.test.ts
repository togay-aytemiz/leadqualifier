import { describe, expect, it, vi } from 'vitest'

import type { AgentPlan } from './contracts'
import {
  appendInternalAgentShadowDiagnostics,
  compareAgentPlanWithObservedTrace,
  isInternalAgentShadowEnabled,
  observeDecisionFromResult,
  observeInternalToolsFromDiagnostics,
  runInternalAgentShadow,
  toolsFromAgentPlan,
} from './shadow'

function plan(overrides: Partial<AgentPlan> = {}): AgentPlan {
  return {
    decision: 'research',
    claims: [
      {
        id: 'claim-1',
        question: 'What is the tuition?',
        requiredEvidence: 'Direct tuition evidence',
        risk: 'medium',
        status: 'unresolved',
      },
    ],
    steps: [
      {
        id: 'step-1',
        tool: 'internal.table',
        claimIds: ['claim-1'],
        args: { sourceGroups: ['brochure'] },
        dependsOn: [],
      },
      {
        id: 'step-2',
        tool: 'internal.claim_verifier',
        claimIds: ['claim-1'],
        args: {},
        dependsOn: ['step-1'],
      },
    ],
    stopConditions: ['answer supported'],
    confidence: 0.82,
    ...overrides,
  }
}

describe('internal agent shadow diagnostics', () => {
  it('compares planned and observed tools without duplicates', () => {
    expect(
      compareAgentPlanWithObservedTrace({
        plannedTools: ['internal.table', 'internal.table', 'internal.presenter'],
        observedTools: ['internal.table', 'internal.claim_verifier', 'internal.table'],
      })
    ).toEqual({
      plannedTools: ['internal.table', 'internal.presenter'],
      observedTools: ['internal.table', 'internal.claim_verifier'],
      missingPlannedTools: ['internal.presenter'],
      extraObservedTools: ['internal.claim_verifier'],
    })
  })

  it('extracts planned tools from agent plans', () => {
    expect(toolsFromAgentPlan(plan())).toEqual(['internal.table', 'internal.claim_verifier'])
    expect(toolsFromAgentPlan(null)).toEqual([])
  })

  it('maps existing diagnostics to canonical observed internal tools', () => {
    expect(
      observeInternalToolsFromDiagnostics({
        queryIntent: 'brochure_table_fact',
        presentationPolish: { usedPolish: true, addedEngagement: false, model: 'gpt-4o-mini' },
        claimLedger: {
          requiresDirectEvidence: true,
          claims: ['fee'],
          supportedClaims: ['fee'],
          unsupportedClaims: [],
        },
        researchBlackboard: {
          facets: ['tuition'],
          attempts: [
            {
              stage: 'fallback',
              query: 'tuition',
              sourceGroups: ['brochure'],
              citationCount: 1,
            },
          ],
        },
        pendingClarification: {
          originalQuestion: 'kaç para',
          clarificationQuestion: 'Hangi program?',
        },
        source: 'rag_grounded_generate_polish',
      })
    ).toEqual([
      'internal.table',
      'internal.file_search',
      'internal.claim_verifier',
      'internal.typed_state',
      'internal.presenter',
      'internal.hybrid_retrieval',
    ])
  })

  it('maps catalog, skills, and explicit research plan tool metadata', () => {
    expect(
      observeInternalToolsFromDiagnostics({
        queryIntent: 'catalog_direct',
        researchPlan: {
          tools: ['file_search', 'internal.catalog'],
        },
        matchedSkill: { id: 'skill-1' },
      })
    ).toEqual(['internal.catalog', 'internal.file_search', 'internal.skill'])
  })

  it('derives observed decisions from current result shape', () => {
    expect(observeDecisionFromResult({ answer: 'Tamam', refusal: false })).toBe('answer')
    expect(
      observeDecisionFromResult({
        answer: 'Hangi program için soruyorsunuz?',
        refusal: false,
        diagnostics: { clarification: 'missing_subject' },
      })
    ).toBe('clarify')
    expect(
      observeDecisionFromResult({
        answer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
        refusal: true,
      })
    ).toBe('no_info')
    expect(observeDecisionFromResult({ answer: 'Bunu yapamam.', refusal: true })).toBe('refuse')
  })

  it('respects the shadow feature flag and optional organization allowlist', () => {
    vi.stubEnv('INTERNAL_AGENT_SHADOW', undefined)
    vi.stubEnv('INTERNAL_AGENT_SHADOW_ORG_IDS', undefined)
    expect(isInternalAgentShadowEnabled('org-1')).toBe(false)

    vi.stubEnv('INTERNAL_AGENT_SHADOW', '1')
    expect(isInternalAgentShadowEnabled('org-1')).toBe(true)

    vi.stubEnv('INTERNAL_AGENT_SHADOW_ORG_IDS', 'org-2, org-3')
    expect(isInternalAgentShadowEnabled('org-1')).toBe(false)
    expect(isInternalAgentShadowEnabled('org-2')).toBe(true)
    expect(isInternalAgentShadowEnabled()).toBe(false)
  })

  it('returns skipped diagnostics when disabled without calling the shadow run', async () => {
    const run = vi.fn()
    const diagnostics = await runInternalAgentShadow({
      organizationId: 'org-1',
      enabled: false,
      observedResult: {
        answer: 'Tıp ücreti 720.000 TL.',
        refusal: false,
        diagnostics: { queryIntent: 'brochure_table_fact' },
      },
      run,
    })

    expect(run).not.toHaveBeenCalled()
    expect(diagnostics).toMatchObject({
      status: 'skipped',
      reason: 'disabled',
      observedDecision: 'answer',
      plannedTools: [],
      observedTools: ['internal.table'],
      extraObservedTools: ['internal.table'],
      claimCount: 0,
    })
  })

  it('completes shadow comparison with plan usage and confidence', async () => {
    const diagnostics = await runInternalAgentShadow({
      organizationId: 'org-1',
      enabled: true,
      observedResult: {
        answer: 'Tıp ücreti 720.000 TL.',
        refusal: false,
        diagnostics: { queryIntent: 'brochure_table_fact', presentationPolish: { model: 'x' } },
      },
      run: async () => ({
        plan: plan(),
        reason: 'shadow_planned',
        usage: { inputTokens: 10, outputTokens: 5, estimatedCredits: 1 },
      }),
    })

    expect(diagnostics).toMatchObject({
      status: 'completed',
      reason: 'shadow_planned',
      plannedDecision: 'research',
      observedDecision: 'answer',
      plannedTools: ['internal.table', 'internal.claim_verifier'],
      observedTools: ['internal.table', 'internal.presenter'],
      missingPlannedTools: ['internal.claim_verifier'],
      extraObservedTools: ['internal.presenter'],
      claimCount: 1,
      plannerConfidence: 0.82,
      inputTokens: 10,
      outputTokens: 5,
      estimatedCredits: 1,
    })
  })

  it('fails open and preserves current answers when shadow execution errors', async () => {
    const current = {
      answer: 'Tıp ücreti 720.000 TL.',
      refusal: false,
      diagnostics: { queryIntent: 'brochure_table_fact' },
    }

    const wrapped = await appendInternalAgentShadowDiagnostics(current, {
      organizationId: 'org-1',
      enabled: true,
      run: async () => {
        throw new Error('planner unavailable')
      },
    })

    expect(wrapped.answer).toBe(current.answer)
    expect(wrapped.refusal).toBe(false)
    expect(wrapped.diagnostics.internalAgentShadow).toMatchObject({
      status: 'error',
      reason: 'planner unavailable',
      observedTools: ['internal.table'],
      extraObservedTools: ['internal.table'],
    })
  })
})
