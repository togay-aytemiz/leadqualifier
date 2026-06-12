import { describe, expect, it } from 'vitest'

import type { InternalAgentShadowDiagnostics } from '@/lib/ai/agent/shadow'
import {
  buildSyntheticAgentShadowAcceptanceCases,
  evaluateSyntheticAgentShadowAcceptance,
  formatSyntheticAgentShadowAcceptanceReport,
  summarizeSyntheticAgentShadowAcceptance,
} from './agent-shadow-synthetic-acceptance'

function shadow(overrides: Partial<InternalAgentShadowDiagnostics>): InternalAgentShadowDiagnostics {
  return {
    status: 'completed',
    plannedDecision: 'research',
    observedDecision: 'answer',
    plannedTools: ['internal.table', 'internal.claim_verifier'],
    observedTools: ['internal.table'],
    missingPlannedTools: ['internal.claim_verifier'],
    extraObservedTools: [],
    claimCount: 1,
    durationMs: 120,
    estimatedCredits: 1.5,
    ...overrides,
  }
}

describe('synthetic internal agent shadow acceptance', () => {
  it('ships a broad self-test suite across generic customer-turn categories', () => {
    const cases = buildSyntheticAgentShadowAcceptanceCases()
    const categories = new Set(cases.map((testCase) => testCase.category))

    expect(cases.length).toBeGreaterThanOrEqual(30)
    expect(Array.from(categories).sort()).toEqual(
      expect.arrayContaining([
        'direct_fact',
        'table_fact',
        'program_catalog',
        'clinical_or_practical',
        'valid_followup',
        'fresh_after_followup',
        'off_topic',
        'unsafe',
      ])
    )
  })

  it('scores decisions and required tools without requiring exact prose', () => {
    const cases = buildSyntheticAgentShadowAcceptanceCases().slice(0, 2)
    const results = evaluateSyntheticAgentShadowAcceptance([
      {
        case: {
          ...cases[0]!,
          expected: {
            allowedDecisions: ['research'],
            requiredPlannedTools: ['internal.table'],
            forbiddenPlannedTools: ['internal.skill'],
          },
        },
        shadow: shadow({ plannedTools: ['internal.table'], missingPlannedTools: [] }),
      },
      {
        case: {
          ...cases[1]!,
          expected: {
            allowedDecisions: ['refuse'],
            requiredPlannedTools: [],
            forbiddenPlannedTools: ['internal.file_search'],
          },
        },
        shadow: shadow({
          plannedDecision: 'research',
          plannedTools: ['internal.file_search'],
          missingPlannedTools: [],
        }),
      },
    ])

    expect(results[0]).toMatchObject({ passed: true, score: 10, issues: [] })
    expect(results[1]?.passed).toBe(false)
    expect(results[1]?.score).toBeLessThan(8)
    expect(results[1]?.issues).toEqual(
      expect.arrayContaining([
        'planned decision research was not one of refuse',
        'forbidden planned tool internal.file_search was used',
      ])
    )
  })

  it('summarizes activation gates and formats markdown', () => {
    const cases = buildSyntheticAgentShadowAcceptanceCases().slice(0, 3)
    const results = evaluateSyntheticAgentShadowAcceptance([
      { case: cases[0]!, shadow: shadow({ missingPlannedTools: [] }) },
      { case: cases[1]!, shadow: shadow({ missingPlannedTools: [] }) },
      {
        case: {
          ...cases[2]!,
          critical: true,
          expected: { allowedDecisions: ['refuse'] },
        },
        shadow: shadow({ plannedDecision: 'research', missingPlannedTools: [] }),
      },
    ])
    const summary = summarizeSyntheticAgentShadowAcceptance(results, {
      minAverageScore: 8,
      minPassRate: 0.8,
      maxCriticalFailures: 0,
      maxShadowErrors: 0,
    })

    expect(summary.total).toBe(3)
    expect(summary.decision).toBe('hold')
    expect(summary.criticalFailures).toBe(1)

    const report = formatSyntheticAgentShadowAcceptanceReport({
      runId: 'test-run',
      model: 'test-model',
      summary,
      results,
    })
    expect(report).toContain('# Internal Agent Synthetic Shadow Acceptance')
    expect(report).toContain('Decision: hold')
    expect(report).toContain('| direct_fact |')
  })
})
