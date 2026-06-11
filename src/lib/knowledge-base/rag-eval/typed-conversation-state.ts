import type { KnowledgeSearchPlanningTurn } from '@/lib/knowledge-base/query-planner'
import type { RagPendingClarificationState } from './types'
import { normalizeRagPendingClarificationState } from './pending-clarification-state'

export type RagTypedConversationStateStatus =
  | 'fresh'
  | 'pending_clarification'
  | 'resolved_from_pending'
  | 'split_pending'
  | 'ignored_pending'

export type RagTypedConversationState = {
  status: RagTypedConversationStateStatus
  activeIntent?: string
  activeEntity?: string
  requestedMetric?: string
  requestedFacet?: string
  missingSlots?: string[]
  sourcePreference?: string[]
  originalQuestion?: string
  latestUserClarification?: string
  lastUserMessage?: string
  lastAssistantOffer?: string
}

type ContextualStateLike = {
  action?: string
  turnType?: string
  stateDecision?: string
  consumedPendingState?: boolean
  retrievalIntent?: string
  requestedMetric?: string
  sourcePreference?: string[]
  missingSlots?: string[]
  originalUserQuestion?: string
  latestUserClarification?: string
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

function readString(value: unknown, maxChars = 240) {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, maxChars).trim() : ''
}

function readStringArray(value: unknown) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => readString(item, 120))
    .filter(Boolean)
    .slice(0, 8)
}

function readStatus(value: unknown): RagTypedConversationStateStatus | null {
  return value === 'fresh' ||
    value === 'pending_clarification' ||
    value === 'resolved_from_pending' ||
    value === 'split_pending' ||
    value === 'ignored_pending'
    ? value
    : null
}

export function normalizeRagTypedConversationState(
  value: unknown
): RagTypedConversationState | null {
  const record = readRecord(value)
  if (!record) return null
  const status = readStatus(record.status)
  if (!status) return null

  const activeIntent = readString(record.activeIntent ?? record.active_intent, 80)
  const activeEntity = readString(record.activeEntity ?? record.active_entity, 120)
  const requestedMetric = readString(record.requestedMetric ?? record.requested_metric, 80)
  const requestedFacet = readString(record.requestedFacet ?? record.requested_facet, 80)
  const missingSlots = readStringArray(record.missingSlots ?? record.missing_slots)
  const sourcePreference = readStringArray(record.sourcePreference ?? record.source_preference)
  const originalQuestion = readString(record.originalQuestion ?? record.original_question, 400)
  const latestUserClarification = readString(
    record.latestUserClarification ?? record.latest_user_clarification,
    240
  )
  const lastUserMessage = readString(record.lastUserMessage ?? record.last_user_message, 240)
  const lastAssistantOffer = readString(record.lastAssistantOffer ?? record.last_assistant_offer, 240)

  return {
    status,
    ...(activeIntent ? { activeIntent } : {}),
    ...(activeEntity ? { activeEntity } : {}),
    ...(requestedMetric ? { requestedMetric } : {}),
    ...(requestedFacet ? { requestedFacet } : {}),
    ...(missingSlots.length ? { missingSlots } : {}),
    ...(sourcePreference.length ? { sourcePreference } : {}),
    ...(originalQuestion ? { originalQuestion } : {}),
    ...(latestUserClarification ? { latestUserClarification } : {}),
    ...(lastUserMessage ? { lastUserMessage } : {}),
    ...(lastAssistantOffer ? { lastAssistantOffer } : {}),
  }
}

function latestAssistantOffer(history: KnowledgeSearchPlanningTurn[] | undefined) {
  const assistant = (history ?? [])
    .slice()
    .reverse()
    .find((turn) => turn.role === 'assistant' && turn.content.trim())
  if (!assistant) return ''
  return /(?:isterseniz|istersen|kontrol edebilirim|bakabilirim|yardimci olabilirim|yardımcı olabilirim)/i.test(
    assistant.content
  )
    ? assistant.content
    : ''
}

export function buildTypedConversationState(input: {
  latestUserMessage: string
  history?: KnowledgeSearchPlanningTurn[]
  pendingClarification?: RagPendingClarificationState | null
  contextualOrchestration?: ContextualStateLike | null
}): RagTypedConversationState {
  const pending = normalizeRagPendingClarificationState(input.pendingClarification)
  const contextual = input.contextualOrchestration
  const consumed = contextual?.consumedPendingState === true || contextual?.stateDecision === 'use'
  const split = contextual?.stateDecision === 'split'
  const ignored = contextual?.stateDecision === 'ignore'
  const activeIntent =
    contextual?.retrievalIntent || pending?.retrievalIntent || contextual?.requestedMetric || pending?.requestedMetric
  const requestedMetric = contextual?.requestedMetric || pending?.requestedMetric || pending?.requestedFacet

  if (pending && split) {
    return {
      status: 'split_pending',
      ...(activeIntent ? { activeIntent } : {}),
      ...(requestedMetric ? { requestedMetric } : {}),
      ...(pending.requestedFacet ? { requestedFacet: pending.requestedFacet } : {}),
      ...(contextual?.sourcePreference?.length || pending.sourcePreference?.length
        ? { sourcePreference: contextual?.sourcePreference ?? pending.sourcePreference }
        : {}),
      originalQuestion: pending.originalQuestion,
      latestUserClarification:
        contextual?.latestUserClarification || input.latestUserMessage.trim(),
      lastUserMessage: input.latestUserMessage.trim(),
    }
  }

  if (pending && consumed) {
    return {
      status: 'resolved_from_pending',
      ...(activeIntent ? { activeIntent } : {}),
      ...(requestedMetric ? { requestedMetric } : {}),
      ...(pending.requestedFacet ? { requestedFacet: pending.requestedFacet } : {}),
      ...(contextual?.sourcePreference?.length || pending.sourcePreference?.length
        ? { sourcePreference: contextual?.sourcePreference ?? pending.sourcePreference }
        : {}),
      originalQuestion: pending.originalQuestion,
      latestUserClarification:
        contextual?.latestUserClarification || input.latestUserMessage.trim(),
      lastUserMessage: input.latestUserMessage.trim(),
    }
  }

  if (pending && ignored) {
    return {
      status: 'ignored_pending',
      ...(activeIntent ? { activeIntent } : {}),
      ...(requestedMetric ? { requestedMetric } : {}),
      originalQuestion: pending.originalQuestion,
      lastUserMessage: input.latestUserMessage.trim(),
    }
  }

  if (pending) {
    return {
      status: 'pending_clarification',
      ...(activeIntent ? { activeIntent } : {}),
      ...(requestedMetric ? { requestedMetric } : {}),
      ...(pending.requestedFacet ? { requestedFacet: pending.requestedFacet } : {}),
      ...(pending.missingSlots?.length ? { missingSlots: pending.missingSlots } : {}),
      ...(pending.sourcePreference?.length ? { sourcePreference: pending.sourcePreference } : {}),
      originalQuestion: pending.originalQuestion,
      lastUserMessage: input.latestUserMessage.trim(),
    }
  }

  return {
    status: 'fresh',
    ...(activeIntent ? { activeIntent } : {}),
    ...(requestedMetric ? { requestedMetric } : {}),
    ...(contextual?.missingSlots?.length ? { missingSlots: contextual.missingSlots } : {}),
    ...(contextual?.sourcePreference?.length ? { sourcePreference: contextual.sourcePreference } : {}),
    lastUserMessage: input.latestUserMessage.trim(),
    ...(latestAssistantOffer(input.history) ? { lastAssistantOffer: latestAssistantOffer(input.history) } : {}),
  }
}

function typedStateCandidatesFromMetadata(metadata: unknown) {
  const record = readRecord(metadata)
  if (!record) return []
  const diagnostics = readRecord(record.diagnostics)
  const ragFileSearch = readRecord(record.rag_file_search)
  const fileSearchDiagnostics = readRecord(ragFileSearch?.diagnostics)

  return [
    record.typedConversationState,
    record.typed_conversation_state,
    diagnostics?.typedConversationState,
    diagnostics?.typed_conversation_state,
    fileSearchDiagnostics?.typedConversationState,
    fileSearchDiagnostics?.typed_conversation_state,
  ]
}

export function findLatestRagTypedConversationState(
  history: KnowledgeSearchPlanningTurn[]
): RagTypedConversationState | null {
  for (const turn of history.slice().reverse()) {
    if (turn.role !== 'assistant') continue
    for (const candidate of typedStateCandidatesFromMetadata(turn.metadata)) {
      const state = normalizeRagTypedConversationState(candidate)
      if (state) return state
    }
  }
  return null
}

export function formatRagTypedConversationStateForPrompt(
  state: RagTypedConversationState | null | undefined
) {
  const normalized = normalizeRagTypedConversationState(state)
  if (!normalized) return 'No typed conversation state.'

  return JSON.stringify(
    {
      status: normalized.status,
      active_intent: normalized.activeIntent,
      active_entity: normalized.activeEntity,
      requested_metric: normalized.requestedMetric,
      requested_facet: normalized.requestedFacet,
      missing_slots: normalized.missingSlots ?? [],
      source_preference: normalized.sourcePreference ?? [],
      original_question: normalized.originalQuestion,
      latest_user_clarification: normalized.latestUserClarification,
      last_user_message: normalized.lastUserMessage,
      last_assistant_offer: normalized.lastAssistantOffer,
    },
    null,
    2
  )
}

export function summarizeRagTypedConversationState(state: RagTypedConversationState) {
  return {
    status: state.status,
    ...(state.activeIntent ? { activeIntent: state.activeIntent } : {}),
    ...(state.activeEntity ? { activeEntity: state.activeEntity } : {}),
    ...(state.requestedMetric ? { requestedMetric: state.requestedMetric } : {}),
    ...(state.requestedFacet ? { requestedFacet: state.requestedFacet } : {}),
    ...(state.missingSlots?.length ? { missingSlots: state.missingSlots } : {}),
    ...(state.sourcePreference?.length ? { sourcePreference: state.sourcePreference } : {}),
    ...(state.originalQuestion ? { originalQuestion: state.originalQuestion } : {}),
    ...(state.latestUserClarification
      ? { latestUserClarification: state.latestUserClarification }
      : {}),
    ...(state.lastUserMessage ? { lastUserMessage: state.lastUserMessage } : {}),
    ...(state.lastAssistantOffer ? { lastAssistantOffer: state.lastAssistantOffer } : {}),
  }
}
