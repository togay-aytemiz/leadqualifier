import OpenAI from 'openai'

import {
  formatBehaviorPolicyForPrompt,
  type BehaviorPolicy,
} from '@/lib/ai/behavior-policy'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'

import { parseLlmFirstTurnPlan, type LlmFirstTurnPlan } from './contracts'

type CompletionUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: CompletionUsage
}

export type LlmFirstPlannerCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

export type LlmFirstPlannerResult = {
  plan: LlmFirstTurnPlan
  repaired: boolean
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  model: string
}

const DEFAULT_MODEL = 'gpt-4.1-mini'
const MAX_HISTORY_TURNS = 12

function jsonObject(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null
  try {
    return JSON.parse(match[0]) as unknown
  } catch {
    return null
  }
}

function normalizeUsage(usage: CompletionUsage | undefined) {
  const inputTokens = usage?.prompt_tokens ?? 0
  const outputTokens = usage?.completion_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
  }
}

function addUsage(
  left: ReturnType<typeof normalizeUsage>,
  right: ReturnType<typeof normalizeUsage>
) {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    totalTokens: left.totalTokens + right.totalTokens,
  }
}

function systemPrompt(
  policy: BehaviorPolicy,
  responseLanguage: string,
  tenantContext?: string | null
) {
  return [
    'You are the sole semantic turn planner for Qualy. Do not answer institutional facts.',
    'Read the ordered conversation history and latest user message as one conversation.',
    'The latest user correction overrides earlier assistant assumptions.',
    'A correction that rejects only the assistant\'s mistaken answer must preserve the unresolved user request from earlier history, including comparisons, entities, constraints, and metrics the user already supplied.',
    'Negated or rejected intent must not become the active intent. Example: "ücreti sormadım" means price is explicitly not requested.',
    'Resolve pronouns, short replies, program variants, corrections, and omitted context semantically.',
    'Choose search whenever the approved corpus can answer or compare useful options with the available information.',
    'Institutional questions about campuses, addresses, programs, faculties, fees, rankings, quotas, admissions, contacts, policies, facilities, and services are in-scope search requests unless the tenant instructions explicitly exclude them.',
    'A broad comparison such as a supplied exam rank plus "hangi program" is searchable; do not force the user to pick one program first.',
    'For a broad location question such as "kampüs nerede" with no named campus, search for the organization\'s campuses or locations together instead of selecting one arbitrary address from a document footer.',
    'Choose clarify only when missing information is necessary for a meaningful search and materially changes the answer.',
    'Before clarifying, verify the missing information is not already present in history.',
    'Clarify terse fragments that name a facet but omit the entity, type, cycle, or year needed for a meaningful answer; examples include unnamed affiliated-location questions, broad registration-date questions without cycle/year, or facility/object availability questions without a program or context.',
    'For concrete brochure/table metric questions where the program is known but language, scholarship, or discount variant is not specified, search first and answer all matching table variants when concise instead of forcing a clarification.',
    'Ask exactly one concise, specific clarification question. Never ask generic questions such as "Hangi konuda bilgi almak istersiniz?".',
    'Choose refuse only for unsafe, private, impossible, or clearly out-of-scope requests under the tenant policy.',
    'For search, write a standalone resolved_question that faithfully preserves the requested metric and a focused search_query for OpenAI File Search.',
    'Also provide search_queries with 2-4 complementary retrieval formulations. Include the user wording/literal aliases, canonical subject plus requested fact type, likely source/table labels, and useful semantic synonyms. Keep each query short. Do not invent specific facts, names, or values.',
    'Build search_query from the represented organization, resolved subject, requested fact type, and useful semantic synonyms in the user language. For example, a campus-location request may include equivalents of campus, yerleşke, address, and location. Do not invent specific facts, names, or values.',
    'Do not interpret words mechanically. Understand meaning, negation, and conversation context.',
    'The assistant or bot brand is not the institution. A customer asking about "the campus", "your faculty", or similar tenant facts refers to the represented organization unless the conversation clearly says otherwise.',
    'Return JSON only using exactly one of these shapes:',
    '{"decision":"search","resolved_question":"...","search_query":"...","search_queries":["..."],"answer_goal":"...","response_language":"tr|en","required_facts":["..."],"forbidden_assumptions":["..."],"confidence":0.0}',
    '{"decision":"clarify","clarification_question":"...","missing_information":["..."],"response_language":"tr|en","confidence":0.0}',
    '{"decision":"refuse","refusal_reason":"...","refusal_response":"...","response_language":"tr|en","confidence":0.0}',
    `Preferred response language: ${responseLanguage}.`,
    tenantContext?.trim()
      ? `Tenant identity and assistant context. Use this to identify the represented organization and response style; do not treat ordinary institutional questions as forbidden merely because they are not enumerated here:\n${tenantContext.trim()}`
      : '',
    `Tenant policy:\n${formatBehaviorPolicyForPrompt(policy)}`,
  ].filter(Boolean).join('\n')
}

function conversationMessages(
  recentMessages: KnowledgeSearchPlanningTurn[],
  latestUserMessage: string
) {
  const messages = recentMessages
    .slice(-MAX_HISTORY_TURNS)
    .filter((turn) => turn.content.trim())
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))

  return [
    ...messages,
    { role: 'user' as const, content: latestUserMessage.trim() },
  ]
}

async function defaultCompletion(input: Record<string, unknown>) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Missing OPENAI_API_KEY for LLM-first planner')
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client.chat.completions.create(input as never) as Promise<CompletionResult>
}

export async function runLlmFirstTurnPlanner(input: {
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  responseLanguage: string
  behaviorPolicy: BehaviorPolicy
  tenantContext?: string | null
  model?: string
  createCompletion?: LlmFirstPlannerCreateCompletion
}): Promise<LlmFirstPlannerResult> {
  const model = input.model?.trim() || process.env.OPENAI_LLM_FIRST_PLANNER_MODEL?.trim() || DEFAULT_MODEL
  const createCompletion = input.createCompletion ?? defaultCompletion
  const messages = [
    {
      role: 'system',
      content: systemPrompt(
        input.behaviorPolicy,
        input.responseLanguage,
        input.tenantContext
      ),
    },
    ...conversationMessages(input.recentMessages, input.latestUserMessage),
  ]
  const request = {
    model,
    temperature: 0.1,
    max_tokens: 500,
    response_format: { type: 'json_object' },
    messages,
  }
  const first = await createCompletion(request)
  const firstContent = first.choices?.[0]?.message?.content ?? ''
  const firstPlan = parseLlmFirstTurnPlan(jsonObject(firstContent))
  if (firstPlan) {
    return {
      plan: firstPlan,
      repaired: false,
      usage: normalizeUsage(first.usage),
      model,
    }
  }

  const repair = await createCompletion({
    ...request,
    messages: [
      ...messages,
      { role: 'assistant', content: firstContent },
      {
        role: 'user',
        content:
          'The JSON was invalid or incomplete. Return one valid planner object using exactly the required schema. Do not change the user meaning.',
      },
    ],
  })
  const repairContent = repair.choices?.[0]?.message?.content ?? ''
  const repairedPlan = parseLlmFirstTurnPlan(jsonObject(repairContent))
  if (!repairedPlan) throw new Error('Invalid LLM-first planner response after repair')

  return {
    plan: repairedPlan,
    repaired: true,
    usage: addUsage(normalizeUsage(first.usage), normalizeUsage(repair.usage)),
    model,
  }
}
