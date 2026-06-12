import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { RagChunk } from '@/lib/knowledge-base/rag'

type CompletionUsage = {
  prompt_tokens?: number
  completion_tokens?: number
  total_tokens?: number
}

type CompletionResult = {
  choices?: Array<{ message?: { content?: string | null } | null }>
  usage?: CompletionUsage
}

export type LlmFirstEvidenceCreateCompletion = (
  args: Record<string, unknown>,
  options?: { signal?: AbortSignal }
) => Promise<CompletionResult>

export type LlmFirstGroundedAnswer = {
  answer: string
  usedEvidenceIds: string[]
  sourceChunks: RagChunk[]
  usage: {
    inputTokens: number
    outputTokens: number
    totalTokens: number
  }
  model: string
}

function protectedValues(value: string) {
  return Array.from(
    new Set([
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

function parsePayload(content: string) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  const match = cleaned.match(/\{[\s\S]*\}/)
  if (!match) return null

  try {
    const parsed = JSON.parse(match[0]) as Record<string, unknown>
    const answer = typeof parsed.answer === 'string' ? parsed.answer.trim() : ''
    const ids = Array.isArray(parsed.used_evidence_ids)
      ? parsed.used_evidence_ids
          .filter((item): item is string => typeof item === 'string')
          .map((item) => item.trim())
          .filter(Boolean)
      : []
    return answer && ids.length > 0 ? { answer, ids } : null
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

function evidenceContext(chunks: RagChunk[]) {
  return chunks
    .map((chunk, index) => {
      const title = chunk.document_title?.trim() || chunk.document_id?.trim() || 'Approved source'
      return [`[E${index + 1}] ${title}`, chunk.content.trim()].join('\n')
    })
    .join('\n\n')
}

async function defaultCompletion(args: Record<string, unknown>) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('Missing OPENAI_API_KEY for LLM-first evidence composition')
  }
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

export async function composeLlmFirstGroundedAnswer(input: {
  resolvedQuestion: string
  answerGoal: string
  requiredFacts: string[]
  forbiddenAssumptions: string[]
  responseLanguage: MvpResponseLanguage
  chunks: RagChunk[]
  model: string
  settings?: { bot_name?: string | null; prompt?: string | null }
  createCompletion?: LlmFirstEvidenceCreateCompletion
}): Promise<LlmFirstGroundedAnswer | null> {
  if (input.chunks.length === 0) return null
  const context = evidenceContext(input.chunks)
  const language = input.responseLanguage === 'tr' ? 'Turkish' : 'English'
  const system = [
    `Write a concise customer answer in ${language}.`,
    'Use only the approved evidence below. Do not use model memory.',
    'Answer the resolved question directly. Do not discuss retrieval, files, rows, tables, brochures, chunks, or evidence IDs.',
    'Preserve exact numbers, dates, prices, rankings, addresses, contacts, and qualifiers from evidence.',
    'Do not invent a fact. If the evidence does not answer the question, return {"answer":"NO_ANSWER","used_evidence_ids":[]}.',
    'Return JSON only: {"answer":"...","used_evidence_ids":["E1"]}.',
    input.settings?.prompt?.trim() ? `Tenant behavior: ${input.settings.prompt.trim()}` : '',
    `Answer goal: ${input.answerGoal}`,
    input.requiredFacts.length ? `Required facts: ${input.requiredFacts.join('; ')}` : '',
    input.forbiddenAssumptions.length
      ? `Forbidden assumptions: ${input.forbiddenAssumptions.join('; ')}`
      : '',
    `Approved evidence:\n${context}`,
  ]
    .filter(Boolean)
    .join('\n')
  const createCompletion = input.createCompletion ?? defaultCompletion
  const completion = await createCompletion({
    model: input.model,
    temperature: 0.15,
    max_tokens: 320,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: input.resolvedQuestion },
    ],
  })
  const payload = parsePayload(completion.choices?.[0]?.message?.content ?? '')
  if (!payload || payload.answer === 'NO_ANSWER') return null

  const indexes = payload.ids.map((id) => {
    const match = id.match(/^E(\d+)$/)
    return match ? Number(match[1]) - 1 : -1
  })
  if (indexes.some((index) => index < 0 || index >= input.chunks.length)) return null
  const sourceChunks = Array.from(new Set(indexes)).map((index) => input.chunks[index]!)
  const support = [input.resolvedQuestion, ...sourceChunks.map((chunk) => chunk.content)].join('\n')
  if (protectedValues(payload.answer).some((value) => !supportContainsValue(support, value))) {
    return null
  }
  if (/https?:\/\//i.test(payload.answer)) return null

  return {
    answer: payload.answer,
    usedEvidenceIds: payload.ids,
    sourceChunks,
    usage: normalizeUsage(completion.usage),
    model: input.model,
  }
}
