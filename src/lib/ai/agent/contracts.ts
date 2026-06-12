import type { BehaviorPolicy } from '@/lib/ai/behavior-policy'
import type { RagTypedConversationState } from '@/lib/knowledge-base/rag-eval/typed-conversation-state'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'

export type AgentChannel = 'demo_chat' | 'whatsapp' | 'instagram' | 'telegram' | 'simulator'
export type AgentRisk = 'low' | 'medium' | 'high' | 'critical'
export type AgentDecision = 'research' | 'direct' | 'clarify' | 'refuse' | 'no_info'
export type AgentClaimStatus = 'unresolved' | 'supported' | 'conflicted' | 'unsupported'
export type AgentToolStatus = 'success' | 'empty' | 'error' | 'timeout'

export type AgentBudget = {
  maxRounds: number
  maxToolCalls: number
  maxLatencyMs: number
  maxInputTokens: number
  maxOutputTokens: number
  maxEstimatedCredits: number
}

export const DEFAULT_AGENT_BUDGET: AgentBudget = {
  maxRounds: 3,
  maxToolCalls: 6,
  maxLatencyMs: 30_000,
  maxInputTokens: 20_000,
  maxOutputTokens: 2_000,
  maxEstimatedCredits: 50,
}

export type AgentRequest = {
  organizationId: string
  conversationId?: string
  channel: AgentChannel
  locale: string
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  conversationState?: RagTypedConversationState | null
  behaviorPolicy: BehaviorPolicy
  sourcePolicy: {
    allowedSourceGroups: string[]
    priority: string[]
  }
  budget: AgentBudget
}

export type AtomicAgentClaim = {
  id: string
  question: string
  subject?: string
  facet?: string
  requiredEvidence: string
  risk: AgentRisk
  status: AgentClaimStatus
}

export type AgentPlanStep = {
  id: string
  tool: string
  claimIds: string[]
  args: Record<string, unknown>
  dependsOn: string[]
}

export type AgentPlan = {
  decision: AgentDecision
  claims: AtomicAgentClaim[]
  steps: AgentPlanStep[]
  stopConditions: string[]
  clarification?: {
    question: string
    missingSlots: string[]
  }
  reason?: string
  confidence?: number
}

export type AgentEvidence = {
  id: string
  sourceId: string
  sourceGroup?: string
  authority?: number
  validFrom?: string
  validTo?: string
  quote?: string
  structuredValue?: unknown
}

export type AgentToolResult = {
  tool: string
  status: AgentToolStatus
  evidence: AgentEvidence[]
  supportedClaimIds: string[]
  conflictedClaimIds?: string[]
  usage?: {
    inputTokens?: number
    outputTokens?: number
    estimatedCredits?: number
  }
  diagnostics?: Record<string, unknown>
}

const MAX_ID_CHARS = 80
const MAX_TOOL_CHARS = 120
const MAX_QUESTION_CHARS = 400
const MAX_SUBJECT_CHARS = 160
const MAX_FACET_CHARS = 120
const MAX_EVIDENCE_REQUIREMENT_CHARS = 120
const MAX_STOP_CONDITIONS = 8
const MAX_STOP_CONDITION_CHARS = 80
const MAX_MISSING_SLOTS = 8
const MAX_MISSING_SLOT_CHARS = 80
const MAX_REASON_CHARS = 240

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown, maxChars: number) {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, maxChars).trim()
}

function readStringArray(value: unknown, maxItems: number, maxChars: number) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, maxItems)
    .map((item) => readString(item, maxChars))
    .filter(Boolean)
}

function readStrictStringArray(value: unknown, maxChars: number) {
  if (!Array.isArray(value)) return null

  const normalized = value.map((item) => readString(item, maxChars))
  return normalized.some((item) => !item) ? null : normalized
}

function readDecision(value: unknown): AgentDecision | null {
  return value === 'research' ||
    value === 'direct' ||
    value === 'clarify' ||
    value === 'refuse' ||
    value === 'no_info'
    ? value
    : null
}

function readRisk(value: unknown): AgentRisk | null {
  return value === 'low' || value === 'medium' || value === 'high' || value === 'critical'
    ? value
    : null
}

function normalizeClaim(value: unknown): AtomicAgentClaim | null {
  const record = readRecord(value)
  if (!record) return null

  const id = readString(record.id, MAX_ID_CHARS)
  const question = readString(record.question, MAX_QUESTION_CHARS)
  const subject = readString(record.subject, MAX_SUBJECT_CHARS)
  const facet = readString(record.facet, MAX_FACET_CHARS)
  const requiredEvidence = readString(
    record.requiredEvidence ?? record.required_evidence,
    MAX_EVIDENCE_REQUIREMENT_CHARS
  )
  const risk = readRisk(record.risk)

  if (!id || !question || !requiredEvidence || !risk) return null

  return {
    id,
    question,
    ...(subject ? { subject } : {}),
    ...(facet ? { facet } : {}),
    requiredEvidence,
    risk,
    status: 'unresolved',
  }
}

function normalizeStep(value: unknown): AgentPlanStep | null {
  const record = readRecord(value)
  if (!record) return null

  const id = readString(record.id, MAX_ID_CHARS)
  const tool = readString(record.tool, MAX_TOOL_CHARS)
  const rawClaimIds = record.claimIds ?? record.claim_ids
  const rawDependsOn = record.dependsOn ?? record.depends_on
  const args = readRecord(record.args)

  if (!id || !tool || !Array.isArray(rawClaimIds) || !Array.isArray(rawDependsOn) || !args) {
    return null
  }

  const claimIds = readStrictStringArray(rawClaimIds, MAX_ID_CHARS)
  const dependsOn = readStrictStringArray(rawDependsOn, MAX_ID_CHARS)
  if (!claimIds?.length || !dependsOn) return null

  return { id, tool, claimIds, args, dependsOn }
}

function normalizeClarification(value: unknown): AgentPlan['clarification'] | null {
  const record = readRecord(value)
  if (!record) return null

  const question = readString(record.question, MAX_QUESTION_CHARS)
  const missingSlots = readStringArray(
    record.missingSlots ?? record.missing_slots,
    MAX_MISSING_SLOTS,
    MAX_MISSING_SLOT_CHARS
  )

  return question && missingSlots.length > 0 ? { question, missingSlots } : null
}

function clampBudget(candidate: number | undefined, fallback: number, ceiling: number) {
  const normalized = Number.isFinite(candidate) ? Math.round(candidate as number) : fallback
  return Math.max(1, Math.min(ceiling, normalized))
}

export function normalizeAgentBudget(value: Partial<AgentBudget> = {}): AgentBudget {
  return {
    maxRounds: clampBudget(value.maxRounds, DEFAULT_AGENT_BUDGET.maxRounds, 3),
    maxToolCalls: clampBudget(value.maxToolCalls, DEFAULT_AGENT_BUDGET.maxToolCalls, 6),
    maxLatencyMs: clampBudget(value.maxLatencyMs, DEFAULT_AGENT_BUDGET.maxLatencyMs, 30_000),
    maxInputTokens: clampBudget(value.maxInputTokens, DEFAULT_AGENT_BUDGET.maxInputTokens, 20_000),
    maxOutputTokens: clampBudget(
      value.maxOutputTokens,
      DEFAULT_AGENT_BUDGET.maxOutputTokens,
      2_000
    ),
    maxEstimatedCredits: clampBudget(
      value.maxEstimatedCredits,
      DEFAULT_AGENT_BUDGET.maxEstimatedCredits,
      50
    ),
  }
}

export function normalizeAgentPlan(value: unknown): AgentPlan | null {
  const record = readRecord(value)
  if (!record) return null

  const decision = readDecision(record.decision)
  if (!decision || !Array.isArray(record.claims) || record.claims.length === 0) return null

  const claims = record.claims.map(normalizeClaim)
  if (claims.some((claim) => !claim)) return null

  const normalizedClaims = claims as AtomicAgentClaim[]
  const claimIds = new Set(normalizedClaims.map((claim) => claim.id))
  if (claimIds.size !== normalizedClaims.length) return null

  const steps = (Array.isArray(record.steps) ? record.steps : []).map(normalizeStep)
  if (steps.some((step) => !step)) return null

  const normalizedSteps = steps as AgentPlanStep[]
  const stepIds = new Set(normalizedSteps.map((step) => step.id))
  if (stepIds.size !== normalizedSteps.length) return null

  if (
    normalizedSteps.some(
      (step) =>
        step.claimIds.some((claimId) => !claimIds.has(claimId)) ||
        step.dependsOn.some((stepId) => !stepIds.has(stepId))
    )
  ) {
    return null
  }

  const clarification = normalizeClarification(record.clarification)
  if (decision === 'clarify' && !clarification) return null

  const reason = readString(record.reason, MAX_REASON_CHARS)
  const confidence =
    typeof record.confidence === 'number' && Number.isFinite(record.confidence)
      ? Math.max(0, Math.min(1, record.confidence))
      : undefined

  return {
    decision,
    claims: normalizedClaims,
    steps: normalizedSteps,
    stopConditions: readStringArray(
      record.stopConditions ?? record.stop_conditions,
      MAX_STOP_CONDITIONS,
      MAX_STOP_CONDITION_CHARS
    ),
    ...(clarification ? { clarification } : {}),
    ...(reason ? { reason } : {}),
    ...(confidence !== undefined ? { confidence } : {}),
  }
}
