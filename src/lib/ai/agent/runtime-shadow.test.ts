import { describe, expect, it, vi } from 'vitest'

import {
  buildInternalAgentTurnShadowRequest,
  runInternalAgentTurnShadow,
} from './runtime-shadow'

describe('internal agent runtime shadow', () => {
  it('builds a bounded agent request from behavior settings, state, history, and source policy', () => {
    const request = buildInternalAgentTurnShadowRequest({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      channel: 'whatsapp',
      locale: 'tr',
      latestUserMessage: 'tıp kaç para',
      recentMessages: Array.from({ length: 12 }, (_, index) => ({
        role: index % 2 === 0 ? ('user' as const) : ('assistant' as const),
        content: 'turn-' + (index + 1),
      })),
      conversationState: {
        status: 'pending_clarification',
        activeIntent: 'pricing',
        missingSlots: ['program'],
      },
      settings: {
        bot_name: 'Qualy',
        prompt: 'Öncelik broşür, sonra website HTML ve PDF. Ton profesyonel ve emoji olabilir.',
      },
      sourcePriorityGroups: ['structured_catalog'],
      observedResult: { answer: 'Tıp ücreti 720.000 TL.', refusal: false },
    })

    expect(request).toMatchObject({
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      channel: 'whatsapp',
      locale: 'tr',
      latestUserMessage: 'tıp kaç para',
      conversationState: {
        status: 'pending_clarification',
        activeIntent: 'pricing',
      },
      behaviorPolicy: {
        botName: 'Qualy',
      },
    })
    expect(request.recentMessages.map((turn) => turn.content)).toEqual(
      Array.from({ length: 10 }, (_, index) => 'turn-' + (index + 3))
    )
    expect(request.sourcePolicy.priority).toEqual(
      expect.arrayContaining(['structured_catalog', 'brochure', 'website_html', 'approved_pdf'])
    )
    expect(request.sourcePolicy.allowedSourceGroups).toEqual(
      expect.arrayContaining(['conversation_state', 'behavior_policy', 'skills'])
    )
  })

  it('runs the planner through the common shadow path', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: 'research',
              claims: [
                {
                  id: 'claim-1',
                  question: 'What is the tuition?',
                  required_evidence: 'Direct tuition evidence',
                  risk: 'medium',
                },
              ],
              steps: [
                {
                  id: 'step-1',
                  tool: 'internal.table',
                  claim_ids: ['claim-1'],
                  args: { source_groups: ['brochure'] },
                  depends_on: [],
                },
              ],
              stop_conditions: ['supported answer'],
              reason: 'Need fee table.',
              confidence: 0.8,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }))

    const shadow = await runInternalAgentTurnShadow({
      organizationId: 'org-1',
      enabled: true,
      latestUserMessage: 'tıp kaç para',
      observedResult: {
        answer: 'Tıp ücreti 720.000 TL.',
        refusal: false,
        diagnostics: { queryIntent: 'brochure_table_fact' },
      },
      createCompletion,
    })

    expect(createCompletion).toHaveBeenCalledOnce()
    expect(shadow).toMatchObject({
      status: 'completed',
      plannedDecision: 'research',
      plannedTools: ['internal.table'],
      observedTools: ['internal.table'],
      missingPlannedTools: [],
      extraObservedTools: [],
      claimCount: 1,
      plannerConfidence: 0.8,
      inputTokens: 100,
      outputTokens: 20,
    })
  })
})
