import { describe, expect, it } from 'vitest'

import { buildRagPendingClarificationState } from './pending-clarification-state'
import {
  buildTypedConversationState,
  findLatestRagTypedConversationState,
  formatRagTypedConversationStateForPrompt,
} from './typed-conversation-state'

describe('typed conversation state', () => {
  it('records resolved pending clarification state with intent, metric, entity, and source preference', () => {
    const pending = buildRagPendingClarificationState({
      originalQuestion: 'hangi bölümlere kayıt olabilirim',
      clarificationQuestion: 'Burslu programlar mı yoksa genel olarak tüm bölümler mi?',
      requestedMetric: 'program_list',
      retrievalIntent: 'program_list',
      sourcePreference: ['primary_campaign_material', 'website_html'],
    })

    const state = buildTypedConversationState({
      latestUserMessage: 'genel olarak tüm bölümler',
      pendingClarification: pending,
      contextualOrchestration: {
        action: 'rewrite',
        turnType: 'clarification_answer',
        stateDecision: 'use',
        consumedPendingState: true,
        retrievalIntent: 'program_list',
        requestedMetric: 'program_list',
        latestUserClarification: 'genel olarak tüm bölümler',
        sourcePreference: ['primary_campaign_material', 'website_html'],
      },
    })

    expect(state).toMatchObject({
      status: 'resolved_from_pending',
      activeIntent: 'program_list',
      requestedMetric: 'program_list',
      latestUserClarification: 'genel olarak tüm bölümler',
      sourcePreference: ['primary_campaign_material', 'website_html'],
    })
  })

  it('reads the latest typed state from assistant metadata and formats it for prompts', () => {
    const state = findLatestRagTypedConversationState([
      { role: 'user', content: 'kaç para' },
      {
        role: 'assistant',
        content: 'Hangi program için?',
        metadata: {
          diagnostics: {
            typedConversationState: {
              status: 'pending_clarification',
              activeIntent: 'price',
              requestedMetric: 'price',
              missingSlots: ['program'],
            },
          },
        },
      },
    ])

    expect(state).toMatchObject({
      status: 'pending_clarification',
      activeIntent: 'price',
      requestedMetric: 'price',
      missingSlots: ['program'],
    })
    expect(formatRagTypedConversationStateForPrompt(state)).toContain('"active_intent": "price"')
  })
})
