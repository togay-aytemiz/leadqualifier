export type LlmFirstSearchPlan = {
  decision: 'search'
  resolvedQuestion: string
  searchQuery: string
  searchQueries: string[]
  answerGoal: string
  responseLanguage: string
  requiredFacts: string[]
  forbiddenAssumptions: string[]
  confidence: number
}

export type LlmFirstClarifyPlan = {
  decision: 'clarify'
  clarificationQuestion: string
  missingInformation: string[]
  responseLanguage: string
  confidence: number
}

export type LlmFirstRefusePlan = {
  decision: 'refuse'
  refusalReason: string
  refusalResponse?: string
  responseLanguage: string
  confidence: number
}

export type LlmFirstTurnPlan =
  | LlmFirstSearchPlan
  | LlmFirstClarifyPlan
  | LlmFirstRefusePlan

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function text(value: unknown, maxLength = 600) {
  return typeof value === 'string'
    ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength).trim()
    : ''
}

function textArray(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, maxItems)
    .map((item) => text(item, 240))
    .filter(Boolean)
}

function confidence(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.min(1, parsed))
}

export function parseLlmFirstTurnPlan(value: unknown): LlmFirstTurnPlan | null {
  const input = record(value)
  if (!input) return null

  const decision = text(input.decision, 20)
  const responseLanguage = text(input.response_language ?? input.responseLanguage, 20)
  const planConfidence = confidence(input.confidence)

  if (decision === 'search') {
    const resolvedQuestion = text(input.resolved_question ?? input.resolvedQuestion)
    const searchQuery = text(input.search_query ?? input.searchQuery)
    const answerGoal = text(input.answer_goal ?? input.answerGoal)
    if (!resolvedQuestion || !searchQuery || !answerGoal || !responseLanguage) return null

    return {
      decision,
      resolvedQuestion,
      searchQuery,
      searchQueries: textArray(input.search_queries ?? input.searchQueries, 5),
      answerGoal,
      responseLanguage,
      requiredFacts: textArray(input.required_facts ?? input.requiredFacts),
      forbiddenAssumptions: textArray(
        input.forbidden_assumptions ?? input.forbiddenAssumptions
      ),
      confidence: planConfidence,
    }
  }

  if (decision === 'clarify') {
    const clarificationQuestion = text(
      input.clarification_question ?? input.clarificationQuestion
    )
    const missingInformation = textArray(
      input.missing_information ?? input.missingInformation
    )
    if (!clarificationQuestion || missingInformation.length === 0 || !responseLanguage) return null

    return {
      decision,
      clarificationQuestion,
      missingInformation,
      responseLanguage,
      confidence: planConfidence,
    }
  }

  if (decision === 'refuse') {
    const refusalReason = text(input.refusal_reason ?? input.refusalReason)
    const refusalResponse = text(input.refusal_response ?? input.refusalResponse)
    if (!refusalReason || !responseLanguage) return null

    return {
      decision,
      refusalReason,
      ...(refusalResponse ? { refusalResponse } : {}),
      responseLanguage,
      confidence: planConfidence,
    }
  }

  return null
}
