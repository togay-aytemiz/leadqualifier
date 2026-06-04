export type RagAnswerProvider =
  | 'current_rag'
  | 'openai_file_search'
  | 'openai_file_search_validated'

export type RagEvalLanguage = 'tr' | 'en' | 'unknown'

export type RagEvalCase = {
  id: string
  question: string
  language: RagEvalLanguage
  category: string
  expectedAnswerTerms?: string[]
  expectedAnyAnswerTermGroups?: string[][]
  expectedSourceTerms?: string[]
  expectedAnySourceTermGroups?: string[][]
  preferredSourceTerms?: string[]
  expectedAnyPreferredSourceTermGroups?: string[][]
  followupRequired?: boolean
  followupForbidden?: boolean
  expectedFollowupTerms?: string[]
  expectedAnyFollowupTermGroups?: string[][]
  mustNotContain?: string[]
  unsupported?: boolean
  notes?: string
}

export type RagProviderCitation = {
  providerSourceId: string
  title?: string
  url?: string
  quote?: string
  score?: number
}

export type RagProviderResult = {
  provider: RagAnswerProvider
  answer: string
  answerLanguage?: RagEvalLanguage
  citations: RagProviderCitation[]
  refusal: boolean
  timingsMs: {
    total: number
    retrieval?: number
    generation?: number
    validation?: number
  }
  usage: {
    inputTokens?: number
    outputTokens?: number
    totalTokens?: number
    toolCalls?: number
    storageGbDayEstimate?: number
    estimatedFileSearchCostUsd?: number
    estimatedModelCostUsd?: number
    estimatedCredits?: number
  }
  rawProviderTracePath?: string
  diagnostics?: {
    queryIntent?: string
    retryCount?: number
    followup?: string
  }
}

export type RagEvaluationResult = {
  caseId: string
  provider: RagAnswerProvider
  passed: boolean
  answerCorrect: boolean
  sourceCorrect: boolean
  preferredSourceCorrect: boolean
  noHallucination: boolean
  refusalCorrect: boolean
  followupPresent: boolean
  followupCorrect: boolean
  missingAnswerTerms: string[]
  missingAnyAnswerTermGroups: string[][]
  missingSourceTerms: string[]
  missingAnySourceTermGroups: string[][]
  missingPreferredSourceTerms: string[]
  missingAnyPreferredSourceTermGroups: string[][]
  missingFollowupTerms: string[]
  missingAnyFollowupTermGroups: string[][]
  forbiddenTermsFound: string[]
}

export type RagProviderSummary = {
  count: number
  latencyMs: {
    average: number
    p50: number
    p75: number
    p95: number
    max: number
  }
  estimatedCredits: {
    total: number
    average: number
  }
}
