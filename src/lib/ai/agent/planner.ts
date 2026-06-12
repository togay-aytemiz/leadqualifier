import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import {
  normalizeAgentPlan,
  type AgentPlan,
  type AgentPlanStep,
  type AgentRequest,
  type AtomicAgentClaim,
} from './contracts'
import { reviewAgentPlan, type AgentPlanReviewIssue } from './plan-review'
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

function usageWithExtra(
  left: AgentPlannerResult['usage'],
  right: AgentPlannerResult['usage']
): AgentPlannerResult['usage'] {
  const inputTokens = left.inputTokens + right.inputTokens
  const outputTokens = left.outputTokens + right.outputTokens
  const totalTokens = left.totalTokens + right.totalTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    estimatedCredits: left.estimatedCredits + right.estimatedCredits,
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

const CONTRACT_TEXT_NORMALIZATION_MAP: Record<string, string> = {
  ı: 'i',
  İ: 'i',
  ğ: 'g',
  Ğ: 'g',
  ü: 'u',
  Ü: 'u',
  ş: 's',
  Ş: 's',
  ö: 'o',
  Ö: 'o',
  ç: 'c',
  Ç: 'c',
}

const TABLE_FACT_TERMS = [
  'fee',
  'price',
  'tuition',
  'cost',
  'payment',
  'installment',
  'discount',
  'scholarship',
  'quota',
  'score',
  'ranking',
  'ucret',
  'ücret',
  'fiyat',
  'kac para',
  'kaç para',
  'tl',
  'odeme',
  'ödeme',
  'taksit',
  'indirim',
  'burs',
  'kontenjan',
  'puan',
  'siralama',
  'sıralama',
  'kdv',
  'iban',
  'kart',
]

const CATALOG_FACT_TERMS = [
  'program list',
  'program_list',
  'programs',
  'departments',
  'faculties',
  'schools',
  'offering',
  'exists',
  'bolumler',
  'bölümler',
  'bolum var',
  'bölüm var',
  'fakulte',
  'fakülte',
  'yuksekokul',
  'yüksekokul',
  'programlar',
  'var mi',
  'var mı',
]

function normalizeContractText(value: string) {
  return value
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => CONTRACT_TEXT_NORMALIZATION_MAP[char] ?? char)
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s?]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizedIncludesAny(text: string, terms: string[]) {
  return terms.some((term) => text.includes(normalizeContractText(term)))
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
    'You are before tool execution. For in-scope factual questions, plan approved internal lookups instead of guessing absence.',
    'Never choose no_info before planning an approved internal lookup, unless recent state explicitly shows completed internal lookups with empty or unsupported evidence.',
    'Decompose compound requests into atomic claims. Always include at least one atomic claim for every decision, including clarify, refuse, and no_info.',
    'Plan only unresolved evidence. Do not include tool steps for clarify, refuse, direct, or no_info decisions.',
    'Recent assistant messages are context and never retrieval queries.',
    'If typed_state is pending_clarification and the latest message plausibly fills a missing slot, choose research with internal.typed_state plus the appropriate evidence tool; do not repeat the same clarification.',
    'Short selections and one-word entity answers can fill missing slots: all/both/paid/scholarship/undergraduate/associate, program names, abbreviations, and typo variants may be enough.',
    'If there is no pending clarification but the latest message is a short referential follow-up, resolve it against recent user and assistant turns with internal.typed_state before evidence lookup.',
    'Short referential follow-ups include variants, facets, confirmations, and subjectless metrics such as "English one?", "burslusu?", "%50?", "kaç para?", "tümü", or "olur kontrol et" after an assistant offered to check.',
    'Do not treat a short in-scope follow-up such as "ingilizcesi?" as translation or off-topic when recent turns contain a program, product, service, fee, quota, or other business fact; preserve the prior subject and requested metric.',
    'If the latest message is a fresh standalone question, ignore stale pending clarification state and plan for the latest question.',
    'Fresh-turn signals such as okay, peki, hayir, no, never mind, disregard that, or a new topic after a pending clarification usually mean the user changed topic.',
    'Choose clarify when a required slot cannot be safely inferred.',
    'Clarify table-like metrics that vary by subject, program, row variant, date, or location when the subject is missing, such as bare score, quota, price, duration, or internship-duration requests.',
    'Do not clarify off-topic requests; choose refuse for requests outside the business scope such as weather, recipes, tutoring, horoscopes, or personal entertainment.',
    'Choose refuse for unsafe requests.',
    'Choose research with internal.table for fees, prices, quotas, scores, discounts, payment policy, campus table rows, and other table-like exact facts.',
    'Choose research with internal.catalog for program lists, faculty/school lists, department existence, and structured yes/no institution offerings.',
    'Choose research with internal.file_search for broad institutional facts, hospital or clinical training, internship, laboratory, accreditation, housing, transport, contact, policy, and evidence that needs approved documents.',
    'Do not ask for a program when the question is about a general facility, campus service, institution-level policy, hospital, cadaver, laboratory, housing, transport, food, accreditation, or contact point.',
    'Facility availability questions are in scope for institutions and businesses; do not refuse them as unrelated.',
    'Facility words include cadaver, kadavra, anatomy lab, simulation, hospital, clinic, laboratory, practice, internship, staj, transport, housing, food, and campus services.',
    'For hospital, clinical, internship, laboratory, facility, accreditation, housing, transport, and contact questions, internal.catalog alone is not enough; include internal.file_search unless the question is clearly an exact table row.',
    'Use internal.typed_state when the latest user message answers a pending clarification or depends on recent conversation state.',
    'Add internal.claim_verifier when the plan will produce customer-facing factual claims.',
    'Add internal.presenter only when the turn is already supported/direct and only needs customer-facing style.',
    'Clarification must be an object: { "question": string, "missing_slots": string[] }.',
    'Confidence must be a number from 0 to 1, not a word.',
    'Return JSON only with keys: decision, claims, steps, stop_conditions, clarification, reason, confidence.',
    'Valid research example: {"decision":"research","claims":[{"id":"claim-1","question":"What is the requested fee?","required_evidence":"Direct approved fee evidence","risk":"medium"}],"steps":[{"id":"step-1","tool":"internal.table","claim_ids":["claim-1"],"args":{"source_groups":["brochure"],"query":"requested fee"},"depends_on":[]}],"stop_conditions":["claim supported"],"clarification":null,"reason":"Need exact table fact.","confidence":0.82}.',
    'Valid refusal example: {"decision":"refuse","claims":[{"id":"claim-1","question":"Can the assistant collect sensitive payment credentials?","required_evidence":"Safety boundary","risk":"critical"}],"steps":[],"stop_conditions":["unsafe request refused"],"clarification":null,"reason":"Sensitive data must not be collected.","confidence":0.95}.',
    'Valid clarification example: {"decision":"clarify","claims":[{"id":"claim-1","question":"Which program is needed for the requested metric?","required_evidence":"Missing slot resolution","risk":"medium"}],"steps":[],"stop_conditions":["clarification required"],"clarification":{"question":"Hangi program için öğrenmek istiyorsunuz?","missing_slots":["program"]},"reason":"Program is required before lookup.","confidence":0.78}.',
    'Valid pending follow-up example: latest_message "all" with pending scope clarification -> {"decision":"research","claims":[{"id":"claim-1","question":"Resolve the pending scope and retrieve the requested list","required_evidence":"Conversation state plus approved catalog evidence","risk":"low"}],"steps":[{"id":"step-1","tool":"internal.typed_state","claim_ids":["claim-1"],"args":{"source_groups":["conversation_state"]},"depends_on":[]},{"id":"step-2","tool":"internal.catalog","claim_ids":["claim-1"],"args":{"source_groups":["structured_catalog"],"query":"resolved requested list"},"depends_on":["step-1"]}],"stop_conditions":["claim supported"],"clarification":null,"reason":"Latest message fills pending clarification.","confidence":0.86}.',
    'Valid referential follow-up example: recent user asked "medicine price", assistant answered the fee, latest_message "English one?" -> {"decision":"research","claims":[{"id":"claim-1","question":"Resolve the short follow-up against recent conversation and retrieve the requested variant of the prior fee","required_evidence":"Conversation state plus approved table evidence","risk":"medium"}],"steps":[{"id":"step-1","tool":"internal.typed_state","claim_ids":["claim-1"],"args":{"source_groups":["conversation_state"]},"depends_on":[]},{"id":"step-2","tool":"internal.table","claim_ids":["claim-1"],"args":{"source_groups":["brochure"],"query":"resolved prior subject and latest variant"},"depends_on":["step-1"]}],"stop_conditions":["claim supported"],"clarification":null,"reason":"Latest message depends on recent conversation context.","confidence":0.84}.',
  ].join(' ')

  const userPayload = {
    latest_message: input.request.latestUserMessage,
    recent_ordered_turns: input.request.recentMessages.slice(-10).map((turn) => ({
      role: turn.role,
      content: turn.content,
      ...(turn.metadata ? { metadata: turn.metadata } : {}),
    })),
    typed_state: input.request.conversationState ?? null,
    conversation_context_hints: buildConversationContextHints(input.request),
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

function buildConversationContextHints(request: AgentRequest) {
  const state = request.conversationState
  const status = typeof state?.status === 'string' ? state.status : undefined
  const latest = request.latestUserMessage.trim()
  return {
    has_pending_clarification: status === 'pending_clarification',
    pending_missing_slots: Array.isArray(state?.missingSlots) ? state.missingSlots : [],
    pending_requested_metric: state?.requestedMetric ?? state?.requestedFacet ?? null,
    pending_active_intent: state?.activeIntent ?? null,
    pending_original_question: state?.originalQuestion ?? null,
    has_recent_turns: request.recentMessages.length > 0,
    latest_message_is_short: latest.length > 0 && latest.length <= 40,
    latest_message_should_be_checked_against_pending_state: status === 'pending_clarification',
    latest_message_should_be_checked_against_recent_context:
      status !== 'pending_clarification' &&
      request.recentMessages.length > 0 &&
      latest.length > 0 &&
      latest.length <= 80,
  }
}

function buildPlanRepairMessages(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
  originalContent: string
  parsedPlan: Record<string, unknown> | null
  normalizedPlan: AgentPlan | null
  issues: AgentPlanReviewIssue[]
  validationError?: string | null
}) {
  const system = [
    'You are Qualy internal agent plan repairer. Do not answer the customer.',
    'Repair the planner JSON so it follows the internal agent contract and addresses every listed issue.',
    'Use only AVAILABLE TOOLS and allowed source groups. External web and unregistered tools are forbidden.',
    'Every decision must include at least one atomic claim.',
    'Research decisions must include at least one tool step. Clarify, refuse, direct, and no_info decisions must not include tool steps.',
    'When pending clarification state is used, include internal.typed_state before the evidence tool.',
    'When a short referential follow-up depends on recent conversation, include internal.typed_state before the evidence tool.',
    'When a stale pending state is irrelevant to the latest standalone question, plan for the latest question instead.',
    'Return JSON only with keys: decision, claims, steps, stop_conditions, clarification, reason, confidence.',
  ].join(' ')

  const userPayload = {
    latest_message: input.request.latestUserMessage,
    recent_ordered_turns: input.request.recentMessages.slice(-10),
    typed_state: input.request.conversationState ?? null,
    conversation_context_hints: buildConversationContextHints(input.request),
    behavior_policy: input.request.behaviorPolicy,
    source_policy: input.request.sourcePolicy,
    available_tools: input.toolDescriptors,
    validation_error: input.validationError ?? null,
    repair_issues: input.issues,
    original_raw_output: input.originalContent,
    parsed_plan: input.parsedPlan,
    normalized_plan: input.normalizedPlan,
  }

  return [
    { role: 'system', content: system },
    { role: 'user', content: JSON.stringify(userPayload, null, 2) },
  ]
}

async function tryRepairAgentPlan(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
  createCompletion: AgentPlannerCreateCompletion
  model: string
  originalContent: string
  parsedPlan: Record<string, unknown> | null
  normalizedPlan: AgentPlan | null
  issues: AgentPlanReviewIssue[]
  usage: AgentPlannerResult['usage']
  registeredToolNames: Set<string>
  validationError?: string | null
  signal?: AbortSignal
}): Promise<AgentPlannerResult | null> {
  if (input.issues.length === 0) return null

  const messages = buildPlanRepairMessages(input)
  const prompt = messages.map((message) => message.content).join('\n\n')
  const completion = await input
    .createCompletion(
      {
        model: input.model,
        messages,
        response_format: { type: 'json_object' },
        ...completionParams(input.model),
      },
      input.signal ? { signal: input.signal } : undefined
    )
    .catch(() => null)
  if (!completion) return null
  const content = completion.choices?.[0]?.message?.content ?? ''
  const repairUsage = normalizeUsage(completion.usage, { input: prompt, output: content })
  const parsed = parseJsonObject(content)
  if (!parsed) return null

  const plan = normalizeAgentPlan(parsed)
  if (!plan) return null

  const validationError = validatePlan(
    plan,
    input.registeredToolNames,
    input.request.sourcePolicy.allowedSourceGroups
  )
  if (validationError) return null

  const review = reviewAgentPlan({ request: input.request, plan })
  if (review.shouldRepair) return null

  return {
    plan,
    reason: `repaired: ${plan.reason ?? 'planned'}`,
    usage: usageWithExtra(input.usage, repairUsage),
    model: input.model,
  }
}

function hasIssue(issues: AgentPlanReviewIssue[], code: AgentPlanReviewIssue['code']) {
  return issues.some((issue) => issue.code === code)
}

function firstContractRepairIssue(issues: AgentPlanReviewIssue[]) {
  const priority: AgentPlanReviewIssue['code'][] = [
    'off_topic_clarified',
    'pending_state_reasked',
    'pending_state_missing_typed_state',
    'referential_followup_missing_typed_state',
    'stale_pending_state_clarified',
    'document_evidence_tool_missing',
    'facility_or_policy_refused',
  ]
  for (const code of priority) {
    const issue = issues.find((candidate) => candidate.code === code)
    if (issue) return issue
  }
  return undefined
}

function findToolDescriptor(
  toolDescriptors: InternalAgentToolDescriptor[],
  toolName: string
): InternalAgentToolDescriptor | null {
  return toolDescriptors.find((descriptor) => descriptor.name === toolName) ?? null
}

function selectSourceGroups(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
  toolName: string
}): string[] | null {
  const descriptor = findToolDescriptor(input.toolDescriptors, input.toolName)
  if (!descriptor) return null

  const allowed = new Set(input.request.sourcePolicy.allowedSourceGroups)
  const toolGroups = new Set(descriptor.sourceGroups.filter((group) => allowed.has(group)))
  if (toolGroups.size === 0) return null

  const preferred = [
    ...input.request.sourcePolicy.priority,
    ...input.request.sourcePolicy.allowedSourceGroups,
    ...descriptor.sourceGroups,
  ]
  const ordered = Array.from(new Set(preferred)).filter((group) => toolGroups.has(group))
  return ordered.length > 0 ? ordered.slice(0, 4) : null
}

function chooseContractEvidenceTool(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
  issues: AgentPlanReviewIssue[]
}): string | null {
  const available = new Set(input.toolDescriptors.map((descriptor) => descriptor.name))
  const state = input.request.conversationState
  const stateText = normalizeContractText(
    [
      state?.activeIntent,
      state?.requestedMetric,
      state?.requestedFacet,
      state?.originalQuestion,
      ...(Array.isArray(state?.missingSlots) ? state.missingSlots : []),
    ]
      .filter(Boolean)
      .join(' ')
  )
  const latestText = normalizeContractText(input.request.latestUserMessage)
  const recentText = normalizeContractText(
    input.request.recentMessages
      .slice(-6)
      .map((turn) => turn.content)
      .join(' ')
  )
  const combined = `${latestText} ${stateText} ${recentText}`.trim()

  if (
    hasIssue(input.issues, 'document_evidence_tool_missing') ||
    hasIssue(input.issues, 'facility_or_policy_refused')
  ) {
    return available.has('internal.file_search') ? 'internal.file_search' : null
  }

  if (hasIssue(input.issues, 'stale_pending_state_clarified')) {
    if (normalizedIncludesAny(latestText, TABLE_FACT_TERMS) && available.has('internal.table')) {
      return 'internal.table'
    }
    return available.has('internal.file_search') ? 'internal.file_search' : null
  }

  if (
    hasIssue(input.issues, 'pending_state_reasked') ||
    hasIssue(input.issues, 'pending_state_missing_typed_state') ||
    hasIssue(input.issues, 'referential_followup_missing_typed_state')
  ) {
    if (normalizedIncludesAny(combined, TABLE_FACT_TERMS) && available.has('internal.table')) {
      return 'internal.table'
    }
    if (normalizedIncludesAny(combined, CATALOG_FACT_TERMS) && available.has('internal.catalog')) {
      return 'internal.catalog'
    }
    return available.has('internal.file_search') ? 'internal.file_search' : null
  }

  if (normalizedIncludesAny(latestText, TABLE_FACT_TERMS) && available.has('internal.table')) {
    return 'internal.table'
  }
  if (normalizedIncludesAny(latestText, CATALOG_FACT_TERMS) && available.has('internal.catalog')) {
    return 'internal.catalog'
  }
  return available.has('internal.file_search') ? 'internal.file_search' : null
}

function buildContractEvidenceQuery(input: {
  request: AgentRequest
  issue: AgentPlanReviewIssue
}) {
  if (input.issue.code !== 'referential_followup_missing_typed_state') {
    return input.request.latestUserMessage
  }

  const recent = input.request.recentMessages
    .slice(-4)
    .map((turn) => `${turn.role}: ${turn.content}`)
    .join('\n')
    .slice(0, 1_200)

  return [
    'Resolve this short follow-up against the recent conversation.',
    `Latest: ${input.request.latestUserMessage}`,
    recent ? `Recent context:\n${recent}` : '',
  ]
    .filter(Boolean)
    .join('\n')
}

function buildContractClaim(input: {
  request: AgentRequest
  risk?: AtomicAgentClaim['risk']
  requiredEvidence?: string
}): AtomicAgentClaim {
  return {
    id: 'claim-1',
    question: input.request.latestUserMessage.trim().slice(0, 400) || 'Handle the latest turn',
    requiredEvidence: input.requiredEvidence ?? 'Approved internal evidence or policy boundary',
    risk: input.risk ?? 'medium',
    status: 'unresolved',
  }
}

function buildContractFallbackPlan(input: {
  request: AgentRequest
  toolDescriptors: InternalAgentToolDescriptor[]
  issues: AgentPlanReviewIssue[]
  registeredToolNames: Set<string>
}): { plan: AgentPlan; reason: string } | null {
  const issue = firstContractRepairIssue(input.issues)
  if (!issue) return null

  if (issue.code === 'off_topic_clarified') {
    const plan: AgentPlan = {
      decision: 'refuse',
      claims: [
        buildContractClaim({
          request: input.request,
          risk: 'low',
          requiredEvidence: 'Business scope boundary',
        }),
      ],
      steps: [],
      stopConditions: ['off-topic request bounded'],
      reason: 'Off-topic turn should be bounded instead of clarified.',
      confidence: 0.9,
    }
    return { plan, reason: `contract_repaired: ${issue.code}` }
  }

  const evidenceTool = chooseContractEvidenceTool({
    request: input.request,
    toolDescriptors: input.toolDescriptors,
    issues: input.issues,
  })
  if (!evidenceTool || !input.registeredToolNames.has(evidenceTool)) return null

  const evidenceSourceGroups = selectSourceGroups({
    request: input.request,
    toolDescriptors: input.toolDescriptors,
    toolName: evidenceTool,
  })
  if (!evidenceSourceGroups) return null

  const claim = buildContractClaim({
    request: input.request,
    requiredEvidence:
      evidenceTool === 'internal.table'
        ? 'Exact approved structured or table evidence'
        : evidenceTool === 'internal.catalog'
          ? 'Approved structured catalog evidence'
          : 'Approved document evidence',
  })
  const steps: AgentPlanStep[] = []
  let evidenceDependsOn: string[] = []

  if (
    (issue.code === 'pending_state_reasked' ||
      issue.code === 'pending_state_missing_typed_state' ||
      issue.code === 'referential_followup_missing_typed_state') &&
    input.registeredToolNames.has('internal.typed_state')
  ) {
    const typedStateGroups = selectSourceGroups({
      request: input.request,
      toolDescriptors: input.toolDescriptors,
      toolName: 'internal.typed_state',
    })
    if (typedStateGroups) {
      steps.push({
        id: 'step-1',
        tool: 'internal.typed_state',
        claimIds: [claim.id],
        args: {
          source_groups: typedStateGroups,
          latest_message: input.request.latestUserMessage,
          ...(issue.code === 'referential_followup_missing_typed_state'
            ? {
                recent_turns: input.request.recentMessages.slice(-5),
              }
            : {}),
        },
        dependsOn: [],
      })
      evidenceDependsOn = ['step-1']
    }
  }

  steps.push({
    id: `step-${steps.length + 1}`,
    tool: evidenceTool,
    claimIds: [claim.id],
    args: {
      source_groups: evidenceSourceGroups,
      query: buildContractEvidenceQuery({ request: input.request, issue }),
    },
    dependsOn: evidenceDependsOn,
  })

  const plan: AgentPlan = {
    decision: 'research',
    claims: [claim],
    steps,
    stopConditions: ['claim supported or unsupported by approved evidence'],
    reason: 'Bounded planner contract repair routed the latest turn to approved internal evidence.',
    confidence: 0.78,
  }

  const validationError = validatePlan(
    plan,
    input.registeredToolNames,
    input.request.sourcePolicy.allowedSourceGroups
  )
  if (validationError) return null

  const review = reviewAgentPlan({ request: input.request, plan })
  const unrepairedIssues = review.issues.filter((reviewIssue) => reviewIssue.code !== issue.code)
  if (unrepairedIssues.length > 0) return null

  return { plan, reason: `contract_repaired: ${issue.code}` }
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
      const review = reviewAgentPlan({
        request: input.request,
        plan: null,
        validationError: 'malformed_planner_output',
      })
      const repaired = await tryRepairAgentPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        createCompletion,
        model,
        originalContent: content,
        parsedPlan: null,
        normalizedPlan: null,
        issues: review.issues,
        usage,
        registeredToolNames,
        validationError: 'malformed_planner_output',
        signal: input.signal,
      })
      if (repaired) return repaired

      const contractFallback = buildContractFallbackPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        issues: review.issues,
        registeredToolNames,
      })
      if (contractFallback) {
        return {
          plan: contractFallback.plan,
          reason: contractFallback.reason,
          usage,
          model,
        }
      }

      return { plan: null, reason: 'malformed_planner_output', usage, model }
    }

    const plan = normalizeAgentPlan(parsed)
    if (!plan) {
      const review = reviewAgentPlan({
        request: input.request,
        plan: null,
        validationError: 'invalid_plan',
      })
      const repaired = await tryRepairAgentPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        createCompletion,
        model,
        originalContent: content,
        parsedPlan: parsed,
        normalizedPlan: null,
        issues: review.issues,
        usage,
        registeredToolNames,
        validationError: 'invalid_plan',
        signal: input.signal,
      })
      if (repaired) return repaired

      const contractFallback = buildContractFallbackPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        issues: review.issues,
        registeredToolNames,
      })
      if (contractFallback) {
        return {
          plan: contractFallback.plan,
          reason: contractFallback.reason,
          usage,
          model,
        }
      }

      return { plan: null, reason: 'invalid_plan', usage, model }
    }

    const validationError = validatePlan(
      plan,
      registeredToolNames,
      input.request.sourcePolicy.allowedSourceGroups
    )
    if (validationError) {
      const review = reviewAgentPlan({ request: input.request, plan, validationError })
      const repaired = await tryRepairAgentPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        createCompletion,
        model,
        originalContent: content,
        parsedPlan: parsed,
        normalizedPlan: plan,
        issues: review.issues,
        usage,
        registeredToolNames,
        validationError,
        signal: input.signal,
      })
      if (repaired) return repaired

      const contractFallback = buildContractFallbackPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        issues: review.issues,
        registeredToolNames,
      })
      if (contractFallback) {
        return {
          plan: contractFallback.plan,
          reason: contractFallback.reason,
          usage,
          model,
        }
      }

      return { plan: null, reason: validationError, usage, model }
    }

    const review = reviewAgentPlan({ request: input.request, plan })
    if (review.shouldRepair) {
      const repaired = await tryRepairAgentPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        createCompletion,
        model,
        originalContent: content,
        parsedPlan: parsed,
        normalizedPlan: plan,
        issues: review.issues,
        usage,
        registeredToolNames,
        signal: input.signal,
      })
      if (repaired) return repaired

      const contractFallback = buildContractFallbackPlan({
        request: input.request,
        toolDescriptors: input.toolDescriptors,
        issues: review.issues,
        registeredToolNames,
      })
      if (contractFallback) {
        return {
          plan: contractFallback.plan,
          reason: contractFallback.reason,
          usage,
          model,
        }
      }
    }

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
