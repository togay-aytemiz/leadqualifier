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

export type RagPendingClarificationState = {
  originalQuestion: string
  clarificationQuestion: string
  missingSlots?: string[]
  requestedMetric?: string
  requestedFacet?: string
  retrievalIntent?: string
  sourcePreference?: string[]
  riskLevel?: string
  doNotRetrieveText?: string[]
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
    presentationPolish?: {
      usedPolish: boolean
      addedEngagement: boolean
      model: string
    }
    clarification?: string
    contextualOrchestration?: string
    contextualReason?: string
    contextualQuestion?: string
    contextualTurnType?: string
    contextualResolvedIntent?: string
    contextualOriginalQuestion?: string
    contextualLatestClarification?: string
    contextualShouldRetrieve?: boolean
    contextualDoNotRetrieveText?: string[]
    contextualRetrievalIntent?: string
    contextualRequestedMetric?: string
    contextualSourcePreference?: string[]
    contextualRiskLevel?: string
    contextualStateDecision?: string
    contextualStateConfidence?: number
    contextualStateReason?: string
    contextualConsumedPendingState?: boolean
    pendingClarification?: RagPendingClarificationState
    pendingClarificationUsed?: boolean
    sourcePriority?: {
      primarySourceGroups: string[]
      fallbackSourceGroups?: string[]
      used: boolean
    }
    llmResearchPlan?: {
      route: string
      reason: string
      requiredEvidence: string[]
      used: boolean
      hopCount: number
      confidence?: number
    }
    qualityMode?: 'validated' | 'strict'
    normalizedQuestion?: string
    strictVerdict?: string
    strictQuality?: {
      suggestedScore: 7 | 8 | 9
      tier: string
      reason: string
    }
    strictLlmVerdict?: string
    strictLlmReason?: string
    strictLlmRetryQuery?: string
    researchPlan?: {
      route: string
      tools: string[]
      requiredEvidence: string[]
      sourceGroups: string[]
      expectedClaims: string[]
      riskLevel: string
    }
    claimLedger?: {
      requiresDirectEvidence: boolean
      claims: string[]
      supportedClaims: string[]
      unsupportedClaims: string[]
    }
    evidenceRetry?: {
      attempted: boolean
      outcome?: 'passed' | 'no_evidence' | 'no_supported_answer' | 'critic_rejected'
      reason?: string
      query?: string
      facets?: string[]
    }
    researchBlackboard?: {
      facets: string[]
      attempts: Array<{
        stage: string
        query: string
        sourceGroups: string[]
        citationCount: number
        outcome?: string
        reason?: string
      }>
      finalVerdict?: string
    }
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
