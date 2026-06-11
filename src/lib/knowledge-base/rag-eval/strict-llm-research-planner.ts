import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'
import type { StrictResearchPlan } from './strict-research-plan'
import type { RagProviderResult } from './types'

type CreateCompletionOptions = {
  signal?: AbortSignal
}

export type StrictLlmResearchPlannerCreateCompletion = (
  args: Record<string, unknown>,
  options?: CreateCompletionOptions
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

export type StrictLlmResearchHop = {
  query: string
  sourceGroups: string[]
  purpose: string
  maxResults?: number
}

export type StrictLlmResearchPlanResult = {
  route: string
  reason: string
  requiredEvidence: string[]
  hops: StrictLlmResearchHop[]
  confidence?: number
  usage: RagProviderResult['usage']
  model: string
}

const DEFAULT_RESEARCH_PLANNER_MODEL = 'gpt-4o-mini'
const MAX_RESEARCH_PLANNER_OUTPUT_TOKENS = 520
const MAX_RESEARCH_HOPS = 3
const MAX_HOP_RESULTS = 20

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function readNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
}

function uniqueStrings(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)))
}

function parseJsonObject(content: string): Record<string, unknown> | null {
  try {
    const trimmed = content
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim()
    const objectMatch = trimmed.match(/\{[\s\S]*\}/)
    return JSON.parse(objectMatch?.[0] ?? trimmed) as Record<string, unknown>
  } catch {
    return null
  }
}

function normalizeUsage(
  usage: Awaited<ReturnType<StrictLlmResearchPlannerCreateCompletion>>['usage'],
  fallback: { input: string; output: string }
): RagProviderResult['usage'] {
  const inputTokens = usage?.prompt_tokens ?? Math.ceil(fallback.input.length / 4)
  const outputTokens = usage?.completion_tokens ?? Math.ceil(fallback.output.length / 4)
  const totalTokens = usage?.total_tokens ?? inputTokens + outputTokens
  return {
    inputTokens,
    outputTokens,
    totalTokens,
    toolCalls: 0,
    estimatedCredits: calculateUsageCreditCost({ inputTokens, outputTokens }),
  }
}

function completionParams(model: string) {
  if (/^gpt-5(?:[.-]|$)/i.test(model) || /^o\d/i.test(model)) {
    return {
      reasoning_effort: 'none',
      max_completion_tokens: MAX_RESEARCH_PLANNER_OUTPUT_TOKENS,
    }
  }

  return {
    temperature: 0,
    max_tokens: MAX_RESEARCH_PLANNER_OUTPUT_TOKENS,
  }
}

async function createDefaultCompletion(
  args: Record<string, unknown>,
  options?: CreateCompletionOptions
) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY for strict RAG research planner')
  }
  const { default: OpenAI } = await import('openai')
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return openai.chat.completions.create(
    args as never,
    options?.signal ? { signal: options.signal } : undefined
  ) as Promise<Awaited<ReturnType<StrictLlmResearchPlannerCreateCompletion>>>
}

function normalizeHop(rawHop: unknown): StrictLlmResearchHop | null {
  if (!rawHop || typeof rawHop !== 'object') return null
  const hop = rawHop as Record<string, unknown>
  const query = readString(hop.query)
  if (!query) return null
  const sourceGroups = uniqueStrings(readStringArray(hop.source_groups ?? hop.sourceGroups))
  const purpose = readString(hop.purpose) || 'Retrieve direct evidence for the question.'
  const rawMaxResults = readNumber(hop.max_results ?? hop.maxResults)
  const maxResults = rawMaxResults
    ? Math.max(1, Math.min(MAX_HOP_RESULTS, Math.round(rawMaxResults)))
    : undefined

  return {
    query,
    sourceGroups,
    purpose,
    ...(maxResults ? { maxResults } : {}),
  }
}

function parsePlannerResult(
  content: string,
  usage: Awaited<ReturnType<StrictLlmResearchPlannerCreateCompletion>>['usage'],
  fallbackInput: string,
  model: string
): StrictLlmResearchPlanResult | null {
  const parsed = parseJsonObject(content)
  if (!parsed) return null
  const route = readString(parsed.route) || 'multi_hop_file_search'
  const hops = (Array.isArray(parsed.hops) ? parsed.hops : [])
    .map(normalizeHop)
    .filter((hop): hop is StrictLlmResearchHop => Boolean(hop))
    .slice(0, MAX_RESEARCH_HOPS)
  const allowsNoRetrieval = [
    'off_topic_boundary',
    'safety_refusal',
    'impossible_boundary',
    'no_retrieval',
  ].includes(route)
  if (hops.length === 0 && !allowsNoRetrieval) return null

  return {
    route,
    reason: readString(parsed.reason) || 'llm_research_plan',
    requiredEvidence: uniqueStrings(
      readStringArray(parsed.required_evidence ?? parsed.requiredEvidence)
    ),
    hops,
    ...(typeof readNumber(parsed.confidence) === 'number'
      ? { confidence: readNumber(parsed.confidence) }
      : {}),
    usage: normalizeUsage(usage, { input: fallbackInput, output: content }),
    model,
  }
}

function buildPlannerMessages(input: {
  question: string
  normalizedQuestion: string
  deterministicPlan: StrictResearchPlan
  brochureSourceGroups?: string[]
}) {
  const system = [
    'You are a bounded research planner for a grounded RAG assistant.',
    'Do not answer the user.',
    'Choose 1 to 3 File Search hops that can gather direct evidence for the question.',
    'You are not a general web assistant. Plan File Search only for questions that are in the configured business/organization scope.',
    'If the user asks for external general advice, recipes, weather, market data, taxes, unrelated tutoring, private/system data, fraud, or impossible/manipulative actions, return a boundary route with zero hops.',
    'Boundary routes are: off_topic_boundary, safety_refusal, impossible_boundary, no_retrieval.',
    'Prefer authoritative primary sources already indicated by policy or deterministic routing.',
    'Separate independent facts into separate hops, for example program variant rows and duration/policy evidence.',
    'Do not invent organization facts. Do not request tools other than File Search.',
    'Return only valid JSON with keys: route, reason, required_evidence, confidence, hops.',
    'Each hop must include: query, source_groups, purpose, max_results.',
  ].join(' ')
  const user = [
    `Original question:\n${input.question}`,
    `Normalized question:\n${input.normalizedQuestion}`,
    `Deterministic plan:\n${JSON.stringify(input.deterministicPlan)}`,
    `Primary source groups:\n${JSON.stringify(input.brochureSourceGroups ?? [])}`,
    [
      'Planning rules:',
      '- Use source_groups only when a known source family is clearly useful.',
      '- Leave source_groups empty for broad approved-corpus hops.',
      '- For boundary routes, set hops to [] and required_evidence to ["safe_refusal_boundary"].',
      '- Keep queries short and evidence-seeking.',
      '- Turkish questions should keep Turkish search terms.',
    ].join('\n'),
  ].join('\n\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}

export async function runStrictLlmResearchPlanner(input: {
  question: string
  normalizedQuestion: string
  deterministicPlan: StrictResearchPlan
  brochureSourceGroups?: string[]
  model?: string
  createCompletion?: StrictLlmResearchPlannerCreateCompletion
}): Promise<StrictLlmResearchPlanResult | null> {
  const model =
    input.model?.trim() ||
    process.env.OPENAI_RAG_RESEARCH_PLANNER_MODEL?.trim() ||
    process.env.OPENAI_RAG_MODEL?.trim() ||
    DEFAULT_RESEARCH_PLANNER_MODEL
  const messages = buildPlannerMessages(input)
  const prompt = messages.map((message) => message.content).join('\n\n')
  const createCompletion = input.createCompletion ?? createDefaultCompletion

  try {
    const completion = await createCompletion({
      model,
      messages,
      response_format: { type: 'json_object' },
      ...completionParams(model),
    })
    const content = completion.choices?.[0]?.message?.content ?? ''
    return parsePlannerResult(content, completion.usage, prompt, model)
  } catch {
    return null
  }
}
