import type { AgentDecision, AgentPlan } from './contracts'

export type InternalAgentObservedDecision = 'answer' | 'clarify' | 'refuse' | 'no_info'
export type InternalAgentShadowStatus = 'completed' | 'error' | 'skipped'

export type InternalAgentShadowUsage = {
  inputTokens?: number
  outputTokens?: number
  estimatedCredits?: number
}

export type InternalAgentShadowDiagnostics = {
  status: InternalAgentShadowStatus
  reason?: string
  plannedDecision?: AgentDecision
  observedDecision?: InternalAgentObservedDecision
  plannedTools: string[]
  observedTools: string[]
  missingPlannedTools: string[]
  extraObservedTools: string[]
  claimCount: number
  plannerConfidence?: number
  durationMs: number
  inputTokens?: number
  outputTokens?: number
  estimatedCredits?: number
}

export type InternalAgentShadowRunResult = {
  plan?: AgentPlan | null
  decision?: AgentDecision | InternalAgentObservedDecision
  reason?: string
  usage?: InternalAgentShadowUsage
}

type ObservedDiagnostics = Record<string, unknown>

type ObservedResult = {
  answer?: string
  refusal?: boolean
  citations?: unknown[]
  diagnostics?: ObservedDiagnostics
}

type ShadowComparison = Pick<
  InternalAgentShadowDiagnostics,
  'plannedTools' | 'observedTools' | 'missingPlannedTools' | 'extraObservedTools'
>

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>()
  const ordered: string[] = []

  for (const value of values) {
    const normalized = value.trim()
    if (!normalized || seen.has(normalized)) continue
    seen.add(normalized)
    ordered.push(normalized)
  }

  return ordered
}

function addTool(tools: string[], tool: string): void {
  tools.push(tool)
}

function readNestedRecord(record: Record<string, unknown>, key: string): Record<string, unknown> {
  const value = record[key]
  return isRecord(value) ? value : {}
}

function hasNonEmptyObject(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return isRecord(value) && Object.keys(value).length > 0
}

function hasNonEmptyArray(record: Record<string, unknown>, key: string): boolean {
  const value = record[key]
  return Array.isArray(value) && value.length > 0
}

function observedToolFromQueryIntent(intent: unknown): string | null {
  if (intent === 'catalog_direct') return 'internal.catalog'
  if (intent === 'brochure_table_fact') return 'internal.table'
  return null
}

export function compareAgentPlanWithObservedTrace(input: {
  plannedTools: string[]
  observedTools: string[]
}): ShadowComparison {
  const plannedTools = uniqueOrdered(input.plannedTools)
  const observedTools = uniqueOrdered(input.observedTools)
  const observed = new Set(observedTools)
  const planned = new Set(plannedTools)

  return {
    plannedTools,
    observedTools,
    missingPlannedTools: plannedTools.filter((tool) => !observed.has(tool)),
    extraObservedTools: observedTools.filter((tool) => !planned.has(tool)),
  }
}

export function toolsFromAgentPlan(plan?: AgentPlan | null): string[] {
  if (!plan) return []
  return uniqueOrdered(plan.steps.map((step) => step.tool))
}

export function observeInternalToolsFromDiagnostics(
  diagnostics?: ObservedDiagnostics | null
): string[] {
  if (!diagnostics) return []

  const tools: string[] = []
  const queryIntentTool = observedToolFromQueryIntent(diagnostics.queryIntent)
  if (queryIntentTool) addTool(tools, queryIntentTool)

  const researchPlan = readNestedRecord(diagnostics, 'researchPlan')
  for (const tool of asStringArray(researchPlan.tools)) {
    addTool(tools, tool.startsWith('internal.') ? tool : `internal.${tool}`)
  }

  const llmResearchPlan = readNestedRecord(diagnostics, 'llmResearchPlan')
  if (llmResearchPlan.used || Number(llmResearchPlan.hopCount) > 0) {
    addTool(tools, 'internal.file_search')
  }

  const researchBlackboard = readNestedRecord(diagnostics, 'researchBlackboard')
  if (hasNonEmptyArray(researchBlackboard, 'attempts')) {
    addTool(tools, 'internal.file_search')
  }

  if (
    hasNonEmptyObject(diagnostics, 'claimLedger') ||
    hasNonEmptyObject(diagnostics, 'universalClaimLedger') ||
    diagnostics.strictLlmVerdict
  ) {
    addTool(tools, 'internal.claim_verifier')
  }

  if (
    diagnostics.clarification ||
    diagnostics.pendingClarification ||
    diagnostics.pendingClarificationUsed ||
    diagnostics.contextualStateDecision ||
    diagnostics.typedConversationState
  ) {
    addTool(tools, 'internal.typed_state')
  }

  if (diagnostics.presentationPolish || diagnostics.rag_polish) {
    addTool(tools, 'internal.presenter')
  }

  if (diagnostics.matchedSkill || diagnostics.matched_skill_title || diagnostics.skill_id) {
    addTool(tools, 'internal.skill')
  }

  if (
    diagnostics.response_kind ||
    diagnostics.source ||
    diagnostics.rag ||
    diagnostics.knowledge_base ||
    diagnostics.knowledgeBase ||
    diagnostics.sourcePriority
  ) {
    addTool(tools, 'internal.hybrid_retrieval')
  }

  return uniqueOrdered(tools)
}

export function observeInternalToolsFromResult(result: ObservedResult): string[] {
  return observeInternalToolsFromDiagnostics(result.diagnostics)
}

export function observeDecisionFromResult(result: ObservedResult): InternalAgentObservedDecision {
  const diagnostics = result.diagnostics ?? {}
  if (diagnostics.clarification || diagnostics.pendingClarification) return 'clarify'
  if (result.refusal) {
    const answer = (result.answer ?? '').toLocaleLowerCase('tr-TR')
    if (
      answer.includes('net bir bilgi bulunmamaktadır') ||
      answer.includes('belgede') ||
      answer.includes('kaynaklarda')
    ) {
      return 'no_info'
    }
    return 'refuse'
  }
  return 'answer'
}

export function isInternalAgentShadowEnabled(organizationId?: string | null): boolean {
  if (process.env.INTERNAL_AGENT_SHADOW !== '1') return false

  const allowlist = (process.env.INTERNAL_AGENT_SHADOW_ORG_IDS ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean)

  if (allowlist.length === 0) return true
  return Boolean(organizationId && allowlist.includes(organizationId))
}

export async function runInternalAgentShadow(input: {
  organizationId?: string | null
  observedResult: ObservedResult
  run: () => Promise<InternalAgentShadowRunResult>
  enabled?: boolean
}): Promise<InternalAgentShadowDiagnostics> {
  const startedAt = Date.now()
  const enabled = input.enabled ?? isInternalAgentShadowEnabled(input.organizationId)
  const observedDecision = observeDecisionFromResult(input.observedResult)
  const observedTools = observeInternalToolsFromResult(input.observedResult)

  if (!enabled) {
    return {
      status: 'skipped',
      reason: 'disabled',
      observedDecision,
      plannedTools: [],
      observedTools,
      missingPlannedTools: [],
      extraObservedTools: observedTools,
      claimCount: 0,
      durationMs: Date.now() - startedAt,
    }
  }

  try {
    const shadow = await input.run()
    const comparison = compareAgentPlanWithObservedTrace({
      plannedTools: toolsFromAgentPlan(shadow.plan),
      observedTools,
    })

    return {
      status: 'completed',
      ...(shadow.reason ? { reason: shadow.reason } : {}),
      ...(shadow.plan?.decision ? { plannedDecision: shadow.plan.decision } : {}),
      observedDecision,
      ...comparison,
      claimCount: shadow.plan?.claims.length ?? 0,
      ...(shadow.plan?.confidence === undefined
        ? {}
        : { plannerConfidence: shadow.plan.confidence }),
      durationMs: Date.now() - startedAt,
      ...(shadow.usage?.inputTokens === undefined ? {} : { inputTokens: shadow.usage.inputTokens }),
      ...(shadow.usage?.outputTokens === undefined
        ? {}
        : { outputTokens: shadow.usage.outputTokens }),
      ...(shadow.usage?.estimatedCredits === undefined
        ? {}
        : { estimatedCredits: shadow.usage.estimatedCredits }),
    }
  } catch (error) {
    return {
      status: 'error',
      reason: error instanceof Error ? error.message : 'shadow_error',
      observedDecision,
      plannedTools: [],
      observedTools,
      missingPlannedTools: [],
      extraObservedTools: observedTools,
      claimCount: 0,
      durationMs: Date.now() - startedAt,
    }
  }
}

export async function appendInternalAgentShadowDiagnostics<
  T extends { diagnostics?: ObservedDiagnostics },
>(
  current: T,
  input: Omit<Parameters<typeof runInternalAgentShadow>[0], 'observedResult'>
): Promise<
  T & { diagnostics: ObservedDiagnostics & { internalAgentShadow: InternalAgentShadowDiagnostics } }
> {
  const internalAgentShadow = await runInternalAgentShadow({
    ...input,
    observedResult: current,
  })

  return {
    ...current,
    diagnostics: {
      ...(current.diagnostics ?? {}),
      internalAgentShadow,
    },
  }
}
