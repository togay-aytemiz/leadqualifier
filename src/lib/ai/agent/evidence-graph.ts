import type {
  AgentClaimStatus,
  AgentEvidence,
  AgentToolResult,
  AgentToolStatus,
  AtomicAgentClaim,
} from './contracts'

export type AgentEvidenceEdge = {
  evidenceId: string
  claimId: string
}

export type AgentEvidenceAttempt = {
  stepId: string
  tool: string
  status: AgentToolStatus
  evidenceIds: string[]
  supportedClaimIds: string[]
  conflictedClaimIds: string[]
  diagnostics?: Record<string, unknown>
}

export type AgentUnsupportedReason = {
  claimId: string
  reason: string
}

export type AgentEvidenceGraphSummary = {
  supportedClaimIds: string[]
  unresolvedClaimIds: string[]
  conflictedClaimIds: string[]
  unsupportedClaimIds: string[]
  attemptCount: number
}

export type AgentEvidenceGraphSnapshot = {
  claims: AtomicAgentClaim[]
  evidence: AgentEvidence[]
  supportEdges: AgentEvidenceEdge[]
  conflictEdges: AgentEvidenceEdge[]
  attempts: AgentEvidenceAttempt[]
  unsupportedReasons: AgentUnsupportedReason[]
}

export type AgentEvidenceGraph = {
  addToolResult: (stepId: string, result: AgentToolResult) => void
  markUnsupported: (claimIds: string[], reason: string) => void
  hasSuccessfulAttempt: (stepId: string) => boolean
  summary: () => AgentEvidenceGraphSummary
  snapshot: () => AgentEvidenceGraphSnapshot
}

function cloneValue<T>(value: T): T {
  return value === undefined ? value : structuredClone(value)
}

function cloneClaim(claim: AtomicAgentClaim): AtomicAgentClaim {
  return { ...claim }
}

function cloneEvidence(evidence: AgentEvidence): AgentEvidence {
  return {
    ...evidence,
    ...(evidence.structuredValue === undefined
      ? {}
      : { structuredValue: cloneValue(evidence.structuredValue) }),
  }
}

function cloneAttempt(attempt: AgentEvidenceAttempt): AgentEvidenceAttempt {
  return {
    ...attempt,
    evidenceIds: [...attempt.evidenceIds],
    supportedClaimIds: [...attempt.supportedClaimIds],
    conflictedClaimIds: [...attempt.conflictedClaimIds],
    ...(attempt.diagnostics === undefined
      ? {}
      : { diagnostics: cloneValue(attempt.diagnostics) }),
  }
}

function stableSerialize(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null'

  switch (typeof value) {
    case 'undefined':
      return 'undefined'
    case 'string':
      return `string:${JSON.stringify(value)}`
    case 'boolean':
      return `boolean:${value}`
    case 'number':
      if (Number.isNaN(value)) return 'number:NaN'
      if (value === Infinity) return 'number:Infinity'
      if (value === -Infinity) return 'number:-Infinity'
      if (Object.is(value, -0)) return 'number:-0'
      return `number:${value}`
    case 'bigint':
      return `bigint:${value.toString()}`
    case 'symbol':
      return `symbol:${String(value.description)}`
    case 'function':
      return `function:${String(value)}`
  }

  if (ancestors.has(value)) {
    throw new Error('Evidence structuredValue must not contain circular references')
  }

  ancestors.add(value)
  let serialized: string

  if (Array.isArray(value)) {
    serialized = `array:[${value.map((item) => stableSerialize(item, ancestors)).join(',')}]`
  } else if (value instanceof Date) {
    serialized = `date:${value.toISOString()}`
  } else {
    const record = value as Record<string, unknown>
    serialized = `object:{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key], ancestors)}`)
      .join(',')}}`
  }

  ancestors.delete(value)
  return serialized
}

function evidenceKey(evidence: AgentEvidence): string {
  return JSON.stringify([
    evidence.sourceId,
    evidence.quote === undefined ? null : evidence.quote,
    stableSerialize(evidence.structuredValue),
  ])
}

function edgeKey(edge: AgentEvidenceEdge): string {
  return JSON.stringify([edge.evidenceId, edge.claimId])
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values))
}

export function createAgentEvidenceGraph(
  initialClaims: AtomicAgentClaim[]
): AgentEvidenceGraph {
  const claims = initialClaims.map(cloneClaim)
  const claimById = new Map<string, AtomicAgentClaim>()

  for (const claim of claims) {
    if (claimById.has(claim.id)) {
      throw new Error(`Duplicate initial claim id: ${claim.id}`)
    }
    claimById.set(claim.id, claim)
  }

  const evidence: AgentEvidence[] = []
  const evidenceByKey = new Map<string, AgentEvidence>()
  const evidenceKeyById = new Map<string, string>()
  const supportEdges: AgentEvidenceEdge[] = []
  const supportEdgeKeys = new Set<string>()
  const conflictEdges: AgentEvidenceEdge[] = []
  const conflictEdgeKeys = new Set<string>()
  const attempts: AgentEvidenceAttempt[] = []
  const attemptsByStepId = new Map<string, AgentEvidenceAttempt>()
  const unsupportedReasons: AgentUnsupportedReason[] = []

  function assertKnownClaims(claimIds: string[]): void {
    for (const claimId of claimIds) {
      if (!claimById.has(claimId)) {
        throw new Error(`Unknown claim id: ${claimId}`)
      }
    }
  }

  function addEdges(
    target: AgentEvidenceEdge[],
    knownEdgeKeys: Set<string>,
    evidenceIds: string[],
    claimIds: string[]
  ): void {
    for (const evidenceId of evidenceIds) {
      for (const claimId of claimIds) {
        const edge = { evidenceId, claimId }
        const key = edgeKey(edge)
        if (knownEdgeKeys.has(key)) continue

        knownEdgeKeys.add(key)
        target.push(edge)
      }
    }
  }

  function setClaimStatus(claimIds: string[], status: AgentClaimStatus): void {
    for (const claimId of claimIds) {
      const claim = claimById.get(claimId) as AtomicAgentClaim
      if (claim.status !== 'conflicted') claim.status = status
    }
  }

  return {
    addToolResult(stepId, result) {
      const normalizedStepId = stepId.trim()
      if (!normalizedStepId) throw new Error('Step id is required')
      if (attemptsByStepId.has(normalizedStepId)) {
        throw new Error(`Duplicate attempt step id: ${normalizedStepId}`)
      }

      const supportedClaimIds = unique(result.supportedClaimIds)
      const conflictedClaimIds = unique(result.conflictedClaimIds ?? [])
      assertKnownClaims([...supportedClaimIds, ...conflictedClaimIds])
      if (
        result.status !== 'success' &&
        (supportedClaimIds.length > 0 || conflictedClaimIds.length > 0)
      ) {
        throw new Error(`Non-successful tool result cannot resolve claims: ${result.tool}`)
      }

      const stagedEvidence: AgentEvidence[] = []
      const stagedEvidenceByKey = new Map<string, AgentEvidence>()
      const attemptEvidenceIds: string[] = []

      for (const candidate of result.evidence) {
        const key = evidenceKey(candidate)
        const existingKeyForId =
          evidenceKeyById.get(candidate.id) ??
          Array.from(stagedEvidenceByKey.entries()).find(
            ([, staged]) => staged.id === candidate.id
          )?.[0]
        if (existingKeyForId && existingKeyForId !== key) {
          throw new Error(`Evidence id is already used for different content: ${candidate.id}`)
        }
        let canonicalEvidence = evidenceByKey.get(key) ?? stagedEvidenceByKey.get(key)

        if (!canonicalEvidence) {
          canonicalEvidence = cloneEvidence(candidate)
          stagedEvidence.push(canonicalEvidence)
          stagedEvidenceByKey.set(key, canonicalEvidence)
        }

        if (!attemptEvidenceIds.includes(canonicalEvidence.id)) {
          attemptEvidenceIds.push(canonicalEvidence.id)
        }
      }

      const attempt: AgentEvidenceAttempt = {
        stepId: normalizedStepId,
        tool: result.tool,
        status: result.status,
        evidenceIds: attemptEvidenceIds,
        supportedClaimIds,
        conflictedClaimIds,
        ...(result.diagnostics === undefined
          ? {}
          : { diagnostics: cloneValue(result.diagnostics) }),
      }

      for (const node of stagedEvidence) {
        evidence.push(node)
        const key = evidenceKey(node)
        evidenceByKey.set(key, node)
        evidenceKeyById.set(node.id, key)
      }

      addEdges(supportEdges, supportEdgeKeys, attemptEvidenceIds, supportedClaimIds)
      addEdges(conflictEdges, conflictEdgeKeys, attemptEvidenceIds, conflictedClaimIds)
      setClaimStatus(supportedClaimIds, 'supported')
      setClaimStatus(conflictedClaimIds, 'conflicted')
      attempts.push(attempt)
      attemptsByStepId.set(normalizedStepId, attempt)
    },

    markUnsupported(claimIds, reason) {
      const uniqueClaimIds = unique(claimIds)
      assertKnownClaims(uniqueClaimIds)

      for (const claimId of uniqueClaimIds) {
        const claim = claimById.get(claimId) as AtomicAgentClaim
        if (claim.status === 'conflicted') continue

        claim.status = 'unsupported'
        unsupportedReasons.push({ claimId, reason })
      }
    },

    hasSuccessfulAttempt(stepId) {
      return attemptsByStepId.get(stepId.trim())?.status === 'success'
    },

    summary() {
      const idsForStatus = (status: AgentClaimStatus) =>
        claims.filter((claim) => claim.status === status).map((claim) => claim.id)

      return {
        supportedClaimIds: idsForStatus('supported'),
        unresolvedClaimIds: idsForStatus('unresolved'),
        conflictedClaimIds: idsForStatus('conflicted'),
        unsupportedClaimIds: idsForStatus('unsupported'),
        attemptCount: attempts.length,
      }
    },

    snapshot() {
      return {
        claims: claims.map(cloneClaim),
        evidence: evidence.map(cloneEvidence),
        supportEdges: supportEdges.map((edge) => ({ ...edge })),
        conflictEdges: conflictEdges.map((edge) => ({ ...edge })),
        attempts: attempts.map(cloneAttempt),
        unsupportedReasons: unsupportedReasons.map((entry) => ({ ...entry })),
      }
    },
  }
}
