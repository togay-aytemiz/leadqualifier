import type { MvpResponseLanguage } from '@/lib/ai/language'

export type SimpleRagRewritePlan =
  | {
      status: 'search'
      standaloneQuery: string
      responseLanguage: MvpResponseLanguage
    }
  | {
      status: 'respond'
      response: string
      responseLanguage: MvpResponseLanguage
    }
  | {
      status: 'clarify'
      clarificationQuestion: string
      missingSlot: string
      responseLanguage: MvpResponseLanguage
    }
  | {
      status: 'refuse'
      refusalResponse: string
      responseLanguage: MvpResponseLanguage
    }

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, maxLength = 800) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
    : ''
}

function language(value: unknown): MvpResponseLanguage | null {
  return value === 'tr' || value === 'en' ? value : null
}

export function parseSimpleRagRewritePlan(value: unknown): SimpleRagRewritePlan | null {
  const input = record(value)
  if (!input) return null

  const status = text(input.status, 20)
  const responseLanguage = language(input.response_language ?? input.responseLanguage)
  if (!responseLanguage) return null

  if (status === 'search') {
    const standaloneQuery = text(input.standalone_query ?? input.standaloneQuery)
    return standaloneQuery ? { status, standaloneQuery, responseLanguage } : null
  }

  if (status === 'respond') {
    const response = text(input.response)
    return response ? { status, response, responseLanguage } : null
  }

  if (status === 'clarify') {
    const clarificationQuestion = text(
      input.clarification_question ?? input.clarificationQuestion
    )
    const missingSlot = text(input.missing_slot ?? input.missingSlot, 120)
    return clarificationQuestion && missingSlot
      ? { status, clarificationQuestion, missingSlot, responseLanguage }
      : null
  }

  if (status === 'refuse') {
    const refusalResponse = text(input.refusal_response ?? input.refusalResponse)
    return refusalResponse ? { status, refusalResponse, responseLanguage } : null
  }

  return null
}

export function parseJsonObject(content: string) {
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
