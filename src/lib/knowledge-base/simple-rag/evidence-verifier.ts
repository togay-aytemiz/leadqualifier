import OpenAI from 'openai'

import type { MvpResponseLanguage } from '@/lib/ai/language'

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

export type SimpleRagEvidenceVerifierCreateCompletion = (
  input: Record<string, unknown>
) => Promise<CompletionResult>

type Usage = { inputTokens: number; outputTokens: number; totalTokens: number }

export type SimpleRagEvidenceVerifierResult =
  | {
      status: 'skipped'
      reason: 'not_risky'
      usage: Usage
      model: string
    }
  | {
      status: 'pass'
      reason: string
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
      status: 'clarify'
      reason: string
      clarificationQuestion: string
      missingSlot: string
      usage: Usage
      model: string
    }

const DEFAULT_MODEL = 'gpt-4o-mini'
const EMPTY_USAGE: Usage = { inputTokens: 0, outputTokens: 0, totalTokens: 0 }

const HIGH_RISK_PATTERN =
  /(?:akredit|accredit|afiliye|ambulans|application|başarı sırası|basari sirasi|campus|cihaz|clinical|clinic|contact|kontak|credential|denklik|device|diploma|facility|fakülte|fakulte|fee|fiyat|hastane|hospital|housing|kampüs|kampus|klinik|kontenjan|laboratuvar|\blab\b|location|maket|mikroskop|ödeme|odeme|practice|program|puan|quota|rank|registration|servis|service|sıralama|siralama|staj|taksit|transport|ulaşım|ulasim|uygulama|ücret|ucret|yurt)/iu

const NO_INFO_PATTERN =
  /(?:net|açık|acik|doğrudan|dogrudan).{0,80}(?:bilgi|veri|kaynak).{0,80}(?:bulamadım|bulamadim|bulunmuyor|bulunmamaktadır|bulunmamaktadir|yok|yer almıyor|yer almiyor|belirtilmemiş|belirtilmemis)|(?:could not find|not enough information|not directly stated)/iu

function compactWhitespace(value: string, maxLength = 2400) {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
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

function text(value: unknown, maxLength = 600) {
  return typeof value === 'string' ? compactWhitespace(value, maxLength) : ''
}

function chunkContext(chunks: SimpleRagChunk[]) {
  return chunks
    .map((chunk) => [`[${chunk.id}] ${chunk.title}`, chunk.content].join('\n'))
    .join('\n\n')
}

export function shouldVerifySimpleRagEvidence(input: {
  latestUserMessage: string
  answer: string
}) {
  const answer = compactWhitespace(input.answer, 4000)
  if (!answer || NO_INFO_PATTERN.test(answer)) return false

  const combined = `${input.latestUserMessage}\n${answer}`
  return HIGH_RISK_PATTERN.test(combined)
}

async function defaultCompletion(args: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('Missing OPENAI_API_KEY for simple RAG evidence verification')
  const client = new OpenAI({ apiKey })
  return client.chat.completions.create(args as never) as Promise<CompletionResult>
}

export async function verifySimpleRagAnswerEvidence(input: {
  latestUserMessage: string
  standaloneQuery: string
  answer: string
  chunks: SimpleRagChunk[]
  responseLanguage: MvpResponseLanguage
  model?: string
  createCompletion?: SimpleRagEvidenceVerifierCreateCompletion
}): Promise<SimpleRagEvidenceVerifierResult> {
  const model = input.model?.trim() || DEFAULT_MODEL

  if (
    !shouldVerifySimpleRagEvidence({
      latestUserMessage: input.latestUserMessage,
      answer: input.answer,
    })
  ) {
    return { status: 'skipped', reason: 'not_risky', usage: EMPTY_USAGE, model }
  }

  const createCompletion = input.createCompletion ?? defaultCompletion
  const language = input.responseLanguage === 'tr' ? 'Turkish' : 'English'

  try {
    const completion = await createCompletion({
      model,
      temperature: 0,
      max_tokens: 220,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content: [
            'You are a strict evidence verifier for a customer-facing RAG answer.',
            'Decide whether the selected chunks directly support the assistant answer for the user’s exact subject and requested facet.',
            'Pass only when the evidence explicitly supports the claim. Related or adjacent evidence is not enough.',
            'For hospital status/existence, accreditation/current recognition, program existence, facilities/resources, devices, labs, clinical practice, internship, payment policy, fees, quotas, scores/rankings, contact values, location, transport, housing, or campus-life services, require direct evidence for that exact claim.',
            'If the evidence supports only a related topic, return no_info.',
            'If a missing subject/facet prevents verification and a concise clarification would help, return clarify.',
            `Write clarification questions in ${language}.`,
            'Return JSON only: {"verdict":"pass","reason":"..."} or {"verdict":"no_info","reason":"..."} or {"verdict":"clarify","clarification_question":"...","missing_slot":"...","reason":"..."}',
          ].join('\n'),
        },
        {
          role: 'user',
          content: [
            `Latest user question:\n${input.latestUserMessage.trim()}`,
            `Standalone search query:\n${input.standaloneQuery.trim()}`,
            `Assistant answer:\n${input.answer.trim()}`,
            `Selected chunks:\n${chunkContext(input.chunks)}`,
          ].join('\n\n'),
        },
      ],
    })

    const usage = normalizeUsage(completion.usage)
    const payload = parseJsonObject(completion.choices?.[0]?.message?.content ?? '')
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { status: 'no_info', reason: 'invalid_verifier_payload', usage, model }
    }

    const record = payload as Record<string, unknown>
    const verdict = text(record.verdict, 20)
    const reason = text(record.reason, 600) || 'verifier_rejected'

    if (verdict === 'pass') {
      return { status: 'pass', reason, usage, model }
    }

    if (verdict === 'clarify') {
      const clarificationQuestion = text(
        record.clarification_question ?? record.clarificationQuestion,
        800
      )
      const missingSlot = text(record.missing_slot ?? record.missingSlot, 120)
      if (clarificationQuestion && missingSlot) {
        return {
          status: 'clarify',
          reason,
          clarificationQuestion,
          missingSlot,
          usage,
          model,
        }
      }
      return { status: 'no_info', reason: 'invalid_clarification_payload', usage, model }
    }

    if (verdict === 'no_info') {
      return { status: 'no_info', reason, usage, model }
    }

    return { status: 'no_info', reason: 'invalid_verifier_payload', usage, model }
  } catch (error) {
    return {
      status: 'no_info',
      reason: error instanceof Error ? error.message : 'verifier_error',
      usage: EMPTY_USAGE,
      model,
    }
  }
}
