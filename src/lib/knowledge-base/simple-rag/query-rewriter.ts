import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from '@/lib/knowledge-base/rag-eval/types'

import {
  parseJsonObject,
  parseSimpleRagRewritePlan,
  type SimpleRagRewritePlan,
} from './contracts'

type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export type SimpleRagCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

const DEFAULT_MODEL = 'gpt-4.1-mini'

function normalizeUsage(usage: CompletionResult['usage']) {
  const inputTokens = usage?.prompt_tokens ?? 0
  const outputTokens = usage?.completion_tokens ?? 0
  return {
    inputTokens,
    outputTokens,
    totalTokens: usage?.total_tokens ?? inputTokens + outputTokens,
  }
}

function recentHistory(turns: KnowledgeSearchPlanningTurn[]) {
  return turns
    .filter((turn) => turn.content.trim())
    .slice(-6)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
}

async function defaultCompletion(args: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for simple RAG query rewriting')
  const client = new OpenAI({ apiKey })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

function systemPrompt(responseLanguage: MvpResponseLanguage) {
  return [
    'Rewrite the latest user question into one clear standalone search query.',
    'Use explicit state and recent conversation history only to resolve references such as this, it, that plan, that program, or a short correction.',
    'The latest user correction overrides earlier assistant assumptions.',
    'Do not answer the question. Do not invent facts, values, entities, synonyms, source labels, or query lists.',
    'If the latest question is already standalone, preserve its meaning and requested facet.',
    'Clarify only when an unresolved missing value materially changes what must be searched. Ask exactly one specific question.',
    'Refuse only unsafe or prohibited requests, never an ordinary knowledge-base miss.',
    `Default response language: ${responseLanguage}.`,
    'Return JSON only using one exact shape:',
    '{"status":"search","standalone_query":"...","response_language":"tr|en"}',
    '{"status":"clarify","clarification_question":"...","missing_slot":"...","response_language":"tr|en"}',
    '{"status":"refuse","refusal_response":"...","response_language":"tr|en"}',
  ].join('\n')
}

export async function rewriteSimpleRagQuery(input: {
  latestUserMessage: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  pendingClarification?: RagPendingClarificationState | null
  responseLanguage: MvpResponseLanguage
  model?: string
  createCompletion?: SimpleRagCreateCompletion
}): Promise<{
  plan: SimpleRagRewritePlan
  usage: { inputTokens: number; outputTokens: number; totalTokens: number }
  model: string
}> {
  const model = input.model?.trim() || DEFAULT_MODEL
  const createCompletion = input.createCompletion ?? defaultCompletion
  const completion = await createCompletion({
    model,
    temperature: 0,
    max_tokens: 220,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: systemPrompt(input.responseLanguage) },
      {
        role: 'user',
        content: [
          `Latest user message:\n${input.latestUserMessage.trim()}`,
          `Explicit state:\n${JSON.stringify(input.pendingClarification ?? null)}`,
          `Recent history:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
        ]
          .filter(Boolean)
          .join('\n\n'),
      },
    ],
  })

  const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
  const plan = parseSimpleRagRewritePlan(payload)
  if (!plan) throw new Error('Simple RAG query rewriter returned invalid JSON')

  return { plan, usage: normalizeUsage(completion.usage), model }
}
