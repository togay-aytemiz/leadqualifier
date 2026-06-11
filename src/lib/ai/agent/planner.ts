import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import { normalizeAgentPlan, type AgentPlan, type AgentRequest } from './contracts'
import type { InternalAgentToolDescriptor } from './tool-registry'

type AgentPlannerCreateCompletionOptions = {
  signal?: AbortSignal
}

export type AgentPlannerCreateCompletion = (
  args: Record<string, unknown>,
  options?: AgentPlannerCreateCompletionOptions
) => Promise<{
  choices?: Array<{
    message?: {
      content?: string | null
    } | null
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}>

export type AgentPlannerResult = {
  plan: AgentPlan | null
  reason: string
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
    estimatedCredits: number
  }
  model: string
}

const DEFAULT_AGENT_PLANNER_MODEL = 'gpt-4o-mini'
const MAX_AGENT_PLANNER_OUTPUT_TOKENS = 900

const ZERO_USAGE: AgentPlannerResult['usage'] = {
  inputTokens: 0,
  outputTokens: 0,
  totalTokens: 0,
  estimatedCredits: 0,
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()

  const candidates = [trimmed]
  const firstBrace = trimmed.indexOf('{')
  const lastBrace = trimmed.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1))
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate)
      if (isRecord(parsed)) return parsed
    } catch {
      // Try the next bounded object candidate.
    }
  }

  return null
}

function normalizeTokenCount(value: unknown, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.round(value)
    : fallback
}

function normalizeUsage(
  usage: Awaited<ReturnType<AgentPlannerCreateCompletion>>['usage'],
  fallback: { input: string; output: string }
): AgentPlannerResult['usage'] {
  const estimatedInputTokens = Math.ceil(fallback.input.length / 4)
  const estimatedOutputTokens = Math.ceil(fallback.output.length / 4)
  const inputTokens = normalizeTokenCount(usage?.prompt_tokens, estimatedInputTokens)
  const outputTokens = normalizeTokenCount(usage?.completion_tokens, estimatedOutputTokens)
  const totalTokens = normalizeTokenCount(usage?.total_tokens, inputTokens + outputTokens)

  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
  }
}

function completionParams(model: string) {
  if (/^gpt-5(?:[.-]|$)/i.test(model) || /^o\d/i.test(model)) {
    return {
      reasoning_effort: 'none',
      max_completion_tokens: MAX_AGENT_PLANNER_OUTPUT_TOKENS,
    }
  }

  return {
    temperature: 0,
    max_tokens: MAX_AGENT_PLANNER_OUTPUT_TOKENS,
  }
}

async function createDefaultCompletion(
  args: Record<string, unknown>,
  options?: AgentPlannerCreateCompletionOptions
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY for internal agent planner')
  }

  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai.chat.completions.create(
    args as never,
    options?.signal ? { signal: options.signal } : undefined
  ) as Promise<Awaited<ReturnType<AgentPlannerCreateCompletion>>>
}

function validateToolRegistry(toolDescriptors: InternalAgentToolDescriptor[]) {
  const names = new Set<string>()

  for (const descriptor of toolDescriptors) {
    if (
      !descriptor ||
      typeof descriptor.name !== 'string' ||
      !/^internal\..+/.test(descriptor.name) ||
      !Array.isArray(descriptor.sourceGroups) ||
      descriptor.sourceGroups.some(
        (sourceGroup) => typeof sourceGroup !== 'string' || !sourceGroup.trim()
      ) ||
      descriptor.sourceGroups.includes('external_web') ||
      names.has(descriptor.name)
    ) {
      return null
    }

    names.add(descriptor.name)
  }

  return names
}

function readRequestedSourceGroups(args: Record<string, unknown>): string[] | null {
  const candidates = [args.sourceGroups, args.source_groups].filter((value) => value !== undefined)
  const sourceGroups: string[] = []

  for (const candidate of candidates) {
    if (
      !Array.isArray(candidate) ||
      candidate.some((value) => typeof value !== 'string' || !value.trim())
    ) {
      return null
    }

    sourceGroups.push(...candidate.map((value) => (value as string).trim()))
  }

  return sourceGroups
}

function validatePlan(
  plan: AgentPlan,
  registeredToolNames: Set<string>,
  allowedSourceGroups: string[]
): 'invalid_plan' | 'unregistered_tool' | 'disallowed_source_group' | null {
  if (
    (plan.decision === 'research' && plan.steps.length === 0) ||
    (plan.decision !== 'research' && plan.steps.length > 0)
  ) {
    return 'invalid_plan'
  }

  const allowed = new Set(allowedSourceGroups)
  for (const step of plan.steps) {
    if (!registeredToolNames.has(step.tool)) return 'unregistered_tool'

    const requestedSourceGroups = readRequestedSourceGroups(step.args)
    if (!requestedSourceGroups || requestedSourceGroups.some((group) => !allowed.has(group))) {
      return 'disallowed_source_group'
    }
  }

  return null
}

function buildPlannerMessages(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
}) {
  const system = [
    'You are Qualy internal research planner. Do not answer customer.',
    'Use only AVAILABLE TOOLS; external web, public search, arbitrary URLs, and unlisted functions are forbidden.',
    'Decompose compound requests into atomic claims.',
    'Plan only unresolved evidence.',
    'Recent assistant messages are context and never retrieval queries.',
    'Choose clarify when a required slot cannot be safely inferred.',
    'Choose refuse for unsafe requests.',
    'Choose no_info when the approved internal corpus cannot establish a claim.',
    'Return JSON only with keys: decision, claims, steps, stop_conditions, clarification, reason, confidence.',
  ].join(' ')

  const userPayload = {
    latest_message: input.request.latestUserMessage,
    recent_ordered_turns: input.request.recentMessages.slice(-10).map((turn) => ({
      role: turn.role,
      content: turn.content,
      ...(turn.metadata ? { metadata: turn.metadata } : {}),
    })),
    typed_state: input.request.conversationState ?? null,
    behavior_policy: input.request.behaviorPolicy,
    source_policy: {
      allowed: input.request.sourcePolicy.allowedSourceGroups,
      priority: input.request.sourcePolicy.priority,
    },
    hard_budget: input.request.budget,
    available_tools: input.toolDescriptors,
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(userPayload, null, 2) },
  ]
}

function failedResult(reason: string, model: string): AgentPlannerResult {
  return {
    plan: null,
    reason,
    usage: { ...ZERO_USAGE },
    model,
  }
}

export async function planInternalAgentTurn(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
  createCompletion?: AgentPlannerCreateCompletion
  model?: string
  signal?: AbortSignal
}): Promise<AgentPlannerResult> {
  const model = input.model?.trim() || DEFAULT_AGENT_PLANNER_MODEL
  const registeredToolNames = validateToolRegistry(input.toolDescriptors)
  if (!registeredToolNames) return failedResult('invalid_tool_registry', model)

  const messages = buildPlannerMessages(input)
  const prompt = messages.map((message) => message.content).join('\n\n')
  const createCompletion = input.createCompletion ?? createDefaultCompletion

  try {
    const completion = await createCompletion(
      {
        model,
        messages,
        response_format: { type: 'json_object' },
        ...completionParams(model),
      },
      input.signal ? { signal: input.signal } : undefined
    )
    const content = completion.choices?.[0]?.message?.content ?? ''
    const usage = normalizeUsage(completion.usage, { input: prompt, output: content })
    const parsed = parseJsonObject(content)
    if (!parsed) {
      return { plan: null, reason: 'malformed_planner_output', usage, model }
    }

    const plan = normalizeAgentPlan(parsed)
    if (!plan) return { plan: null, reason: 'invalid_plan', usage, model }

    const validationError = validatePlan(
      plan,
      registeredToolNames,
      input.request.sourcePolicy.allowedSourceGroups
    )
    if (validationError) return { plan: null, reason: validationError, usage, model }

    return {
      plan,
      reason: plan.reason ?? 'planned',
      usage,
      model,
    }
  } catch {
    return failedResult('planner_error', model)
  }
}
