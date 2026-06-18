import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'
import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'

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

export type SimpleRagVerifierCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number }

export type SimpleRagVerifierResult =
  | {
      action: 'pass'
      reason: string
      usage: Usage
      model: string
    }
  | {
      action: 'retry_search'
      reason: string
      retryQuery: string
      usage: Usage
      model: string
    }
  | {
      action: 'no_info'
      reason: string
      usage: Usage
      model: string
    }
  | {
      action: 'clarify'
      reason: string
      clarificationQuestion: string
      missingSlot: string
      usage: Usage
      model: string
    }

const DEFAULT_MODEL = 'gpt-4.1-mini'

function normalize(value: string) {
  return value
    .toLocaleLowerCase('tr-TR')
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => ({
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
    }[char] ?? char))
    .replace(/\s+/g, ' ')
    .trim()
}

function text(value: unknown, maxLength = 900) {
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

function chunkContext(chunks: SimpleRagChunk[]) {
  return chunks
    .map((chunk) => [`[${chunk.id}] ${chunk.title} score=${chunk.score}`, chunk.content].join('\n'))
    .join('\n\n')
}

function recentHistory(turns: KnowledgeSearchPlanningTurn[]) {
  return turns
    .filter((turn) => turn.content.trim())
    .slice(-4)
    .map((turn) => ({ role: turn.role, content: turn.content.trim() }))
}

function hasPositiveClaim(answer: string) {
  return /\b(?:evet|var|vardir|mevcut|bulunur|bulunuyor|bulunmaktadir|saglanir|saglanmaktadir|verilir|veriliyor|vardır|bulunmaktadır)\b/.test(
    normalize(answer)
  )
}

export function shouldVerifySimpleRagAnswer(input: {
  latestUserMessage: string
  answer: string
}) {
  const combined = normalize(`${input.latestUserMessage}\n${input.answer}`)
  if (!hasPositiveClaim(input.answer)) return false

  return /\b(?:var mi|varmi|mevcut mu|bulunuyor mu|ucret|fiyat|kac para|kontenjan|kac kisi|puan|siralama|basari sirasi|kampus|kampüs|adres|yerleske|hastane|klinik|hasta|vaka|staj|laboratuvar|lab|cihaz|kadavra|mikroskop|yurt|konaklama|servis|ring|ulasim|otopark|yemekhane|yemek|akredit|denklik|mavi diploma|online|uzaktan|taksit|iban|odeme|telefon|whatsapp|iletisim)\b/.test(
    combined
  )
}

async function defaultCompletion(args: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for simple RAG answer verification')
  const client = new OpenAI({ apiKey })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

export async function verifySimpleRagAnswer(input: {
  latestUserMessage: string
  standaloneQuery: string
  recentMessages: KnowledgeSearchPlanningTurn[]
  responseLanguage: MvpResponseLanguage
  answer: string
  chunks: SimpleRagChunk[]
  model?: string
  createCompletion?: SimpleRagVerifierCreateCompletion
}): Promise<SimpleRagVerifierResult> {
  const model = input.model?.trim() || DEFAULT_MODEL
  const createCompletion = input.createCompletion ?? defaultCompletion
  const language = input.responseLanguage === 'tr' ? 'Turkish' : 'English'
  const completion = await createCompletion({
    model,
    temperature: 0,
    max_tokens: 220,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: [
          `You are a strict RAG answer verifier. Respond in JSON, but write user-facing clarification text in ${language}.`,
          'Check whether the answer is directly supported by the selected chunks for the exact user question.',
          'Do not require perfect wording. Do require exact support for named entities, services, facilities, fees, quotas, locations, payment policies, clinical claims, accreditation/equivalence, and positive availability claims.',
          'If the answer is supported, return pass.',
          'If the answer may be answerable with a better search query, return retry_search with one concise standalone retry_query.',
          'If the answer is unsupported and retry is unlikely to help, return no_info.',
          'If one missing value is essential, return clarify.',
          'Return JSON only:',
          '{"action":"pass","reason":"..."}',
          '{"action":"retry_search","reason":"...","retry_query":"..."}',
          '{"action":"no_info","reason":"..."}',
          '{"action":"clarify","reason":"...","clarification_question":"...","missing_slot":"..."}',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          `Latest user question:\n${input.latestUserMessage.trim()}`,
          `Standalone search query:\n${input.standaloneQuery.trim()}`,
          `Recent history:\n${JSON.stringify(recentHistory(input.recentMessages))}`,
          `Candidate answer:\n${input.answer.trim()}`,
          `Selected chunks:\n${chunkContext(input.chunks)}`,
        ].join('\n\n'),
      },
    ],
  })
  const usage = normalizeUsage(completion.usage)
  const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { action: 'pass', reason: 'invalid_verifier_payload', usage, model }
  }

  const record = payload as Record<string, unknown>
  const action = text(record.action, 40)
  const reason = text(record.reason, 180) || 'unspecified'

  if (action === 'retry_search') {
    const retryQuery = text(record.retry_query ?? record.retryQuery)
    return retryQuery
      ? { action, reason, retryQuery, usage, model }
      : { action: 'no_info', reason: `${reason}:missing_retry_query`, usage, model }
  }

  if (action === 'no_info') return { action, reason, usage, model }

  if (action === 'clarify') {
    const clarificationQuestion = text(
      record.clarification_question ?? record.clarificationQuestion
    )
    const missingSlot = text(record.missing_slot ?? record.missingSlot, 120)
    return clarificationQuestion && missingSlot
      ? { action, reason, clarificationQuestion, missingSlot, usage, model }
      : { action: 'no_info', reason: `${reason}:invalid_clarification`, usage, model }
  }

  return { action: 'pass', reason, usage, model }
}
