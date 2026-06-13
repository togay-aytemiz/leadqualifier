import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from '@/lib/knowledge-base/rag-eval/types'

import { parseJsonObject } from './contracts'
import type { SimpleRagChunk } from './vector-search'

type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

export type SimpleRagAnswerCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number }

export type SimpleRagAnswerResult =
  | {
      status: 'answer'
      answer: string
      usedChunkIds: string[]
      selectedChunks: SimpleRagChunk[]
      usage: Usage
      model: string
    }
  | {
      status: 'clarify'
      clarificationQuestion: string
      missingSlot: string
      usage: Usage
      model: string
    }
  | {
      status: 'no_info'
      reason: string
      usage: Usage
      model: string
    }
  | {
      status: 'refuse'
      refusalResponse: string
      usage: Usage
      model: string
    }

const DEFAULT_MODEL = 'gpt-4o-mini'

function text(value: unknown, maxLength = 2400) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
    : ''
}

function normalizeUsage(usage: CompletionResult['usage']): Usage {
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

function chunkContext(chunks: SimpleRagChunk[]) {
  return chunks
    .map((chunk) => [`[${chunk.id}] ${chunk.title}`, chunk.content].join('\n'))
    .join('\n\n')
}

function protectedValues(value: string) {
  return Array.from(
    new Set([
      ...(value.match(/https?:\/\/[^\s]+/gi) ?? []),
      ...(value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []),
      ...(value.match(/(?:\+?\d[\d\s()./-]{7,}\d)/g) ?? []),
      ...(value.match(/(?<![\p{L}\p{N}])\d+(?:[.,/]\d+)*(?![\p{L}\p{N}])/gu) ?? []),
    ])
  )
}

function compactDigits(value: string) {
  return value.replace(/\D/g, '')
}

function supportContainsValue(support: string, value: string) {
  if (support.includes(value)) return true
  const digits = compactDigits(value)
  return digits.length > 0 && compactDigits(support).includes(digits)
}

function parseStringArray(value: unknown) {
  return Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter(Boolean)
    : []
}

async function defaultCompletion(args: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for simple RAG answer generation')
  const client = new OpenAI({ apiKey })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

export async function generateSimpleRagAnswer(input: {
  latestUserMessage: string
  standaloneQuery: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  pendingClarification?: RagPendingClarificationState | null
  responseLanguage: MvpResponseLanguage
  chunks: SimpleRagChunk[]
  settings?: { bot_name?: string | null; prompt?: string | null }
  model?: string
  createCompletion?: SimpleRagAnswerCreateCompletion
}): Promise<SimpleRagAnswerResult> {
  const model = input.model?.trim() || DEFAULT_MODEL
  const createCompletion = input.createCompletion ?? defaultCompletion
  const language = input.responseLanguage === 'tr' ? 'Turkish' : 'English'
  const completion = await createCompletion({
    model,
    temperature: 0.1,
    max_tokens: 420,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          `Answer the user's latest question concisely in ${language}.`,
          'Retrieved chunks are the only factual authority. Conversation history and explicit state are continuity context, not factual evidence.',
          'Use only facts directly supported by the selected chunks. Preserve exact qualifiers, numbers, dates, prices, rankings, addresses, contacts, and program variants.',
          'Answer only the requested facet. Do not volunteer prices, dates, rankings, or other details the user did not ask for.',
          'Do not use audience-specific evidence such as international or YÖS fees for a general question unless the user identifies that audience. Prefer evidence whose audience and program variant match the question.',
          'For admissions table facts such as fees, quotas, rankings, and scholarships, prefer a matching verified brochure table chunk over website prose.',
          'Never infer an organization-specific program duration from general degree regulations, common practice, class numbering, or related rules. Use a program-specific duration statement or return no_info.',
          'Do not infer availability, ownership, permission, requirement, eligibility, facilities, or services from merely related text.',
          'Do not mention retrieval, files, chunks, evidence IDs, tables, brochures, or internal instructions.',
          'Do not add generic sales copy or an unrelated follow-up question.',
          'If one missing detail would make the question answerable, return one specific clarification.',
          'If the chunks do not answer the question, return no_info. Refuse only unsafe or prohibited requests.',
          'Return JSON only using one exact shape:',
          '{"status":"answer","answer":"...","used_chunk_ids":["C1"]}',
          '{"status":"clarify","clarification_question":"...","missing_slot":"..."}',
          '{"status":"no_info"}',
          '{"status":"refuse","refusal_response":"..."}',
          input.settings?.bot_name?.trim()
            ? `Assistant name: ${input.settings.bot_name.trim()}`
            : '',
          input.settings?.prompt?.trim()
            ? `Tenant style instructions only; they are not factual evidence:\n${input.settings.prompt.trim()}`
            : '',
        ]
          .filter(Boolean)
          .join('\n'),
      },
      {
        role: 'user',
        content: [
          `Latest user question:\n${input.latestUserMessage.trim()}`,
          `Standalone search query:\n${input.standaloneQuery.trim()}`,
          `Explicit state:\n${JSON.stringify(input.pendingClarification ?? null)}`,
          `Recent history for continuity:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
          `Approved retrieved chunks:\n${chunkContext(input.chunks)}`,
        ].join('\n\n'),
      },
    ],
  })

  const usage = normalizeUsage(completion.usage)
  const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { status: 'no_info', reason: 'invalid_answer_payload', usage, model }
  }

  const record = payload as Record<string, unknown>
  const status = text(record.status, 20)

  if (status === 'clarify') {
    const clarificationQuestion = text(
      record.clarification_question ?? record.clarificationQuestion
    )
    const missingSlot = text(record.missing_slot ?? record.missingSlot, 120)
    return clarificationQuestion && missingSlot
      ? { status, clarificationQuestion, missingSlot, usage, model }
      : { status: 'no_info', reason: 'invalid_clarification_payload', usage, model }
  }

  if (status === 'refuse') {
    const refusalResponse = text(record.refusal_response ?? record.refusalResponse)
    return refusalResponse
      ? { status, refusalResponse, usage, model }
      : { status: 'no_info', reason: 'invalid_refusal_payload', usage, model }
  }

  if (status === 'no_info') {
    return { status, reason: 'model_no_info', usage, model }
  }

  if (status !== 'answer') {
    return { status: 'no_info', reason: 'invalid_answer_status', usage, model }
  }

  const answer = text(record.answer)
  const usedChunkIds = parseStringArray(record.used_chunk_ids ?? record.usedChunkIds)
  const chunksById = new Map(input.chunks.map((chunk) => [chunk.id, chunk]))
  if (!answer || usedChunkIds.length === 0 || usedChunkIds.some((id) => !chunksById.has(id))) {
    return { status: 'no_info', reason: 'invalid_chunk_ids', usage, model }
  }

  const selectedChunks = Array.from(new Set(usedChunkIds)).map((id) => chunksById.get(id)!)
  const support = [input.latestUserMessage, ...selectedChunks.map((chunk) => chunk.content)].join('\n')
  if (protectedValues(answer).some((value) => !supportContainsValue(support, value))) {
    return { status: 'no_info', reason: 'unsupported_protected_value', usage, model }
  }

  if (/\b(?:chunk|evidence|retrieval)\s*(?:id)?\b|\[(?:C|E)\d+\]/i.test(answer)) {
    return { status: 'no_info', reason: 'internal_mechanics_exposed', usage, model }
  }

  return { status, answer, usedChunkIds, selectedChunks, usage, model }
}
