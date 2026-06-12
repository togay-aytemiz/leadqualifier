import { describe, expect, it } from 'vitest'

import type { AgentEvidence, AgentToolResult, AtomicAgentClaim } from './contracts'
import { createAgentEvidenceGraph } from './evidence-graph'

function claim(id: string, status: AtomicAgentClaim['status'] = 'unresolved'): AtomicAgentClaim {
  return {
    id,
    question: `Question for ${id}`,
    requiredEvidence: `Evidence for ${id}`,
    risk: 'low',
    status,
  }
}

function evidence(
  id: string,
  overrides: Partial<AgentEvidence> = {}
): AgentEvidence {
  return {
    id,
    sourceId: 'source-1',
    quote: 'Approved answer',
    structuredValue: { amount: 100, currency: 'TRY' },
    ...overrides,
  }
}

function toolResult(overrides: Partial<AgentToolResult> = {}): AgentToolResult {
  return {
    tool: 'internal.knowledge',
    status: 'success',
    evidence: [],
    supportedClaimIds: [],
    ...overrides,
  }
}

describe('agent evidence graph', () => {
  it('resolves one claim while leaving another unresolved', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1'), claim('claim-2')])

    graph.addToolResult(
      'step-1',
      toolResult({
        evidence: [evidence('evidence-1')],
        supportedClaimIds: ['claim-1'],
      })
    )

    expect(graph.summary()).toEqual({
      supportedClaimIds: ['claim-1'],
      unresolvedClaimIds: ['claim-2'],
      conflictedClaimIds: [],
      unsupportedClaimIds: [],
      attemptCount: 1,
    })
  })

  it('gives explicit conflicts precedence and keeps them conflicted', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])

    graph.addToolResult(
      'step-1',
      toolResult({
        evidence: [evidence('evidence-1')],
        supportedClaimIds: ['claim-1'],
        conflictedClaimIds: ['claim-1'],
      })
    )
    graph.addToolResult(
      'step-2',
      toolResult({
        evidence: [evidence('evidence-2', { sourceId: 'source-2' })],
        supportedClaimIds: ['claim-1'],
      })
    )

    expect(graph.summary().conflictedClaimIds).toEqual(['claim-1'])
    expect(graph.summary().supportedClaimIds).toEqual([])
  })

  it('deduplicates evidence and identical edges while retaining distinct support edges', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1'), claim('claim-2')])
    const firstEvidence = evidence('evidence-1')
    const duplicateEvidence = evidence('evidence-duplicate', {
      structuredValue: { currency: 'TRY', amount: 100 },
    })

    graph.addToolResult(
      'step-1',
      toolResult({
        evidence: [firstEvidence],
        supportedClaimIds: ['claim-1'],
      })
    )
    graph.addToolResult(
      'step-2',
      toolResult({
        evidence: [duplicateEvidence],
        supportedClaimIds: ['claim-1', 'claim-2'],
      })
    )

    expect(graph.snapshot()).toMatchObject({
      evidence: [firstEvidence],
      supportEdges: [
        { evidenceId: 'evidence-1', claimId: 'claim-1' },
        { evidenceId: 'evidence-1', claimId: 'claim-2' },
      ],
      attempts: [
        { stepId: 'step-1', evidenceIds: ['evidence-1'] },
        { stepId: 'step-2', evidenceIds: ['evidence-1'] },
      ],
    })
  })

  it('rejects unknown supported and conflicted claim references without recording attempts', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])

    expect(() =>
      graph.addToolResult(
        'step-supported',
        toolResult({ supportedClaimIds: ['missing-claim'] })
      )
    ).toThrow('Unknown claim id: missing-claim')
    expect(() =>
      graph.addToolResult(
        'step-conflicted',
        toolResult({ conflictedClaimIds: ['missing-claim'] })
      )
    ).toThrow('Unknown claim id: missing-claim')
    expect(graph.snapshot().attempts).toEqual([])
  })

  it('rejects empty and duplicate step ids', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])

    expect(() => graph.addToolResult('   ', toolResult())).toThrow('Step id is required')

    graph.addToolResult('step-1', toolResult())

    expect(() => graph.addToolResult('step-1', toolResult())).toThrow(
      'Duplicate attempt step id: step-1'
    )
    expect(graph.snapshot().attempts).toHaveLength(1)
  })

  it('records success, empty, and error attempts and only reports successful statuses', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])

    graph.addToolResult('step-success', toolResult({ status: 'success' }))
    graph.addToolResult('step-empty', toolResult({ status: 'empty' }))
    graph.addToolResult(
      'step-error',
      toolResult({
        status: 'error',
        diagnostics: { message: 'upstream failure' },
      })
    )

    expect(graph.hasSuccessfulAttempt('step-success')).toBe(true)
    expect(graph.hasSuccessfulAttempt('step-empty')).toBe(false)
    expect(graph.hasSuccessfulAttempt('step-error')).toBe(false)
    expect(graph.hasSuccessfulAttempt('missing-step')).toBe(false)
    expect(graph.snapshot().attempts).toEqual([
      {
        stepId: 'step-success',
        tool: 'internal.knowledge',
        status: 'success',
        evidenceIds: [],
        supportedClaimIds: [],
        conflictedClaimIds: [],
      },
      {
        stepId: 'step-empty',
        tool: 'internal.knowledge',
        status: 'empty',
        evidenceIds: [],
        supportedClaimIds: [],
        conflictedClaimIds: [],
      },
      {
        stepId: 'step-error',
        tool: 'internal.knowledge',
        status: 'error',
        evidenceIds: [],
        supportedClaimIds: [],
        conflictedClaimIds: [],
        diagnostics: { message: 'upstream failure' },
      },
    ])
    expect(graph.summary().attemptCount).toBe(3)
  })

  it('rejects claim resolution from a non-successful tool result', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])

    expect(() =>
      graph.addToolResult(
        'step-empty',
        toolResult({ status: 'empty', supportedClaimIds: ['claim-1'] })
      )
    ).toThrow('Non-successful tool result cannot resolve claims: internal.knowledge')
    expect(graph.snapshot().attempts).toEqual([])
  })

  it('rejects reuse of one evidence id for different content', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])
    graph.addToolResult(
      'step-1',
      toolResult({ evidence: [evidence('evidence-1')], supportedClaimIds: ['claim-1'] })
    )

    expect(() =>
      graph.addToolResult(
        'step-2',
        toolResult({
          evidence: [evidence('evidence-1', { sourceId: 'different-source' })],
          supportedClaimIds: ['claim-1'],
        })
      )
    ).toThrow('Evidence id is already used for different content: evidence-1')
    expect(graph.snapshot().attempts).toHaveLength(1)
  })

  it('marks claims unsupported explicitly without overwriting conflicts', () => {
    const graph = createAgentEvidenceGraph([
      claim('claim-1'),
      claim('claim-2'),
      claim('claim-3'),
    ])

    graph.addToolResult(
      'step-1',
      toolResult({
        supportedClaimIds: ['claim-1'],
        conflictedClaimIds: ['claim-2'],
      })
    )
    graph.markUnsupported(['claim-1', 'claim-2', 'claim-3'], 'No approved evidence found')

    expect(graph.summary()).toEqual({
      supportedClaimIds: [],
      unresolvedClaimIds: [],
      conflictedClaimIds: ['claim-2'],
      unsupportedClaimIds: ['claim-1', 'claim-3'],
      attemptCount: 1,
    })
    expect(graph.snapshot().unsupportedReasons).toEqual([
      { claimId: 'claim-1', reason: 'No approved evidence found' },
      { claimId: 'claim-3', reason: 'No approved evidence found' },
    ])

    expect(() => graph.markUnsupported(['missing-claim'], 'Missing')).toThrow(
      'Unknown claim id: missing-claim'
    )
    expect(graph.snapshot().unsupportedReasons).toHaveLength(2)
  })

  it('returns snapshots that cannot mutate graph state', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1')])
    graph.addToolResult(
      'step-1',
      toolResult({
        evidence: [
          evidence('evidence-1', {
            structuredValue: { nested: { enabled: true } },
          }),
        ],
        supportedClaimIds: ['claim-1'],
        diagnostics: { nested: { retryable: false } },
      })
    )
    graph.markUnsupported(['claim-1'], 'Explicitly unavailable')

    const snapshot = graph.snapshot()
    snapshot.claims[0].status = 'conflicted'
    snapshot.evidence[0].sourceId = 'mutated-source'
    ;(
      snapshot.evidence[0].structuredValue as { nested: { enabled: boolean } }
    ).nested.enabled = false
    snapshot.supportEdges[0].claimId = 'mutated-claim'
    ;(snapshot.attempts[0].diagnostics as { nested: { retryable: boolean } }).nested.retryable =
      true
    snapshot.unsupportedReasons[0].reason = 'Mutated reason'

    expect(graph.snapshot()).toMatchObject({
      claims: [{ id: 'claim-1', status: 'unsupported' }],
      evidence: [
        {
          id: 'evidence-1',
          sourceId: 'source-1',
          structuredValue: { nested: { enabled: true } },
        },
      ],
      supportEdges: [{ evidenceId: 'evidence-1', claimId: 'claim-1' }],
      attempts: [{ diagnostics: { nested: { retryable: false } } }],
      unsupportedReasons: [{ claimId: 'claim-1', reason: 'Explicitly unavailable' }],
    })
  })

  it('does not mutate initial inputs and rejects duplicate initial claim ids', () => {
    const initialClaim = claim('claim-1')
    const initialClaims = [initialClaim]
    const graph = createAgentEvidenceGraph(initialClaims)

    graph.addToolResult('step-1', toolResult({ supportedClaimIds: ['claim-1'] }))

    expect(initialClaims).toEqual([claim('claim-1')])
    expect(initialClaim.status).toBe('unresolved')
    expect(() => createAgentEvidenceGraph([claim('claim-1'), claim('claim-1')])).toThrow(
      'Duplicate initial claim id: claim-1'
    )
  })

  it('does not infer conflicts from equal structured values', () => {
    const graph = createAgentEvidenceGraph([claim('claim-1'), claim('claim-2')])

    graph.addToolResult(
      'step-1',
      toolResult({
        evidence: [evidence('evidence-1')],
        supportedClaimIds: ['claim-1'],
      })
    )
    graph.addToolResult(
      'step-2',
      toolResult({
        evidence: [evidence('evidence-2', { sourceId: 'source-2' })],
        supportedClaimIds: ['claim-2'],
      })
    )

    expect(graph.summary()).toEqual({
      supportedClaimIds: ['claim-1', 'claim-2'],
      unresolvedClaimIds: [],
      conflictedClaimIds: [],
      unsupportedClaimIds: [],
      attemptCount: 2,
    })
  })
})
