import { describe, expect, it } from 'vitest'

import {
  extractAgentShadowDiagnostics,
  formatAgentShadowReport,
  summarizeAgentShadowTraces,
} from './report-agent-shadow'

describe('agent shadow report helpers', () => {
  it('extracts shadow diagnostics from supported record shapes', () => {
    const shadow = {
      status: 'completed',
      plannedTools: ['internal.table'],
      observedTools: ['internal.table'],
      missingPlannedTools: [],
      extraObservedTools: [],
      claimCount: 1,
      durationMs: 12,
    }

    expect(extractAgentShadowDiagnostics({ metadata: { internal_agent_shadow: shadow } })).toBe(shadow)
    expect(extractAgentShadowDiagnostics({ diagnostics: { internalAgentShadow: shadow } })).toBe(shadow)
    expect(extractAgentShadowDiagnostics({ agentShadow: shadow })).toBe(shadow)
    expect(extractAgentShadowDiagnostics({ metadata: {} })).toBeNull()
  })

  it('summarizes statuses, tools, reasons, duration, and credits', () => {
    const summary = summarizeAgentShadowTraces([
      {
        metadata: {
          internal_agent_shadow: {
            status: 'completed',
            reason: 'Need table.',
            plannedTools: ['internal.table', 'internal.claim_verifier'],
            observedTools: ['internal.table'],
            missingPlannedTools: ['internal.claim_verifier'],
            extraObservedTools: [],
            claimCount: 1,
            durationMs: 10,
            estimatedCredits: 1.25,
          },
        },
      },
      {
        diagnostics: {
          internalAgentShadow: {
            status: 'error',
            reason: 'planner_error',
            plannedTools: [],
            observedTools: ['internal.skill'],
            missingPlannedTools: [],
            extraObservedTools: ['internal.skill'],
            claimCount: 0,
            durationMs: 20,
            estimatedCredits: 0.75,
          },
        },
      },
      { metadata: {} },
    ])

    expect(summary).toEqual({
      total: 2,
      statusCounts: { completed: 1, error: 1 },
      plannedToolCounts: { 'internal.table': 1, 'internal.claim_verifier': 1 },
      observedToolCounts: { 'internal.table': 1, 'internal.skill': 1 },
      missingPlannedToolCounts: { 'internal.claim_verifier': 1 },
      extraObservedToolCounts: { 'internal.skill': 1 },
      reasonCounts: { 'Need table.': 1, planner_error: 1 },
      averageDurationMs: 15,
      estimatedCreditsTotal: 2,
    })
  })

  it('formats a markdown report', () => {
    const report = formatAgentShadowReport({
      total: 1,
      statusCounts: { completed: 1 },
      plannedToolCounts: { 'internal.table': 1 },
      observedToolCounts: { 'internal.table': 1 },
      missingPlannedToolCounts: {},
      extraObservedToolCounts: {},
      reasonCounts: { ok: 1 },
      averageDurationMs: 12,
      estimatedCreditsTotal: 1.5,
    })

    expect(report).toContain('# Internal Agent Shadow Report')
    expect(report).toContain('Total traces: 1')
    expect(report).toContain('| internal.table | 1 |')
    expect(report).toContain('### Missing Planned Tools')
    expect(report).toContain('_No entries._')
  })
})
