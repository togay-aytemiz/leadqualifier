import { describe, expect, it, vi } from 'vitest'
import type { AgentRequest } from './contracts'
import type { AgentPlannerCreateCompletion } from './planner'
import { runInternalAgentActivatedTurn } from './activation'

function request(overrides: Partial<AgentRequest> = {}): AgentRequest {
  return {
    organizationId: 'org-1',
    conversationId: 'conversation-1',
    channel: 'demo_chat',
    locale: 'tr',
    latestUserMessage: 'kaç para',
    recentMessages: [],
    conversationState: null,
    behaviorPolicy: {
      businessScopeHints: ['admissions'],
      outOfScopeHints: ['weather'],
      evidenceRequiredFor: ['fees'],
      sourcePriority: ['brochure'],
      refusalClasses: ['sensitive_personal_data'],
      tone: ['warm', 'concise'],
      botName: 'Qualy',
    },
    sourcePolicy: {
      allowedSourceGroups: [
        'brochure',
        'website_html',
        'approved_pdf',
        'structured_catalog',
        'knowledge_base',
        'conversation_state',
        'behavior_policy',
        'skills',
      ],
      priority: ['brochure', 'website_html', 'approved_pdf', 'knowledge_base'],
    },
    budget: {
      maxRounds: 3,
      maxToolCalls: 6,
      maxLatencyMs: 15_000,
      maxInputTokens: 20_000,
      maxOutputTokens: 2_000,
      maxEstimatedCredits: 50,
    },
    ...overrides,
  }
}

function completionWith(content: Record<string, unknown>): AgentPlannerCreateCompletion {
  return vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(content) } }],
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  }))
}

describe('runInternalAgentActivatedTurn', () => {
  it('returns a controller-owned clarification without executing the current provider', async () => {
    const executeCurrent = vi.fn(async () => ({
      answer: 'Current provider answer should not run.',
      refusal: false,
      citations: [],
      diagnostics: {},
    }))

    const result = await runInternalAgentActivatedTurn({
      request: request({ latestUserMessage: 'kaç para' }),
      executeCurrent,
      createPlannerCompletion: completionWith({
        decision: 'clarify',
        claims: [
          {
            id: 'claim-1',
            question: 'Which subject is needed for price?',
            required_evidence: 'Missing subject slot',
            risk: 'medium',
          },
        ],
        steps: [],
        stop_conditions: ['clarification required'],
        clarification: {
          question: 'Hangi ürün veya program için ücret öğrenmek istiyorsunuz?',
          missing_slots: ['subject'],
        },
        reason: 'Subject is missing.',
        confidence: 0.82,
      }),
      enabled: true,
    })

    expect(executeCurrent).not.toHaveBeenCalled()
    expect(result.result).toMatchObject({
      answer: 'Hangi ürün veya program için ücret öğrenmek istiyorsunuz?',
      refusal: false,
    })
    expect(result.diagnostics).toMatchObject({
      status: 'completed',
      decision: 'clarify',
      activated: true,
    })
  })

  it('runs the current provider as approved bridge evidence for research decisions', async () => {
    const executeCurrent = vi.fn(async () => ({
      answer: 'Tıp Fakültesi ücreti 720.000 TL.',
      refusal: false,
      citations: [{ providerSourceId: 'source-1', title: 'Brochure' }],
      usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, estimatedCredits: 1 },
      diagnostics: { queryIntent: 'brochure_table_fact' },
    }))

    const result = await runInternalAgentActivatedTurn({
      request: request({ latestUserMessage: 'tıp kaç para' }),
      executeCurrent,
      createPlannerCompletion: completionWith({
        decision: 'research',
        claims: [
          {
            id: 'claim-1',
            question: 'What is the requested fee?',
            required_evidence: 'Approved fee evidence',
            risk: 'high',
          },
        ],
        steps: [
          {
            id: 'step-1',
            tool: 'internal.table',
            claim_ids: ['claim-1'],
            args: { source_groups: ['brochure'], query: 'tıp kaç para' },
            depends_on: [],
          },
        ],
        stop_conditions: ['supported'],
        reason: 'Need table evidence.',
        confidence: 0.91,
      }),
      enabled: true,
    })

    expect(executeCurrent).toHaveBeenCalledTimes(1)
    expect(result.result).toMatchObject({
      answer: 'Tıp Fakültesi ücreti 720.000 TL.',
      refusal: false,
      citations: [{ providerSourceId: 'source-1', title: 'Brochure' }],
    })
    expect(result.diagnostics).toMatchObject({
      status: 'completed',
      decision: 'answer',
      activated: true,
      plannedTools: ['internal.table'],
      controller: {
        trace: {
          stopReason: 'all_claims_supported',
        },
      },
    })
  })

  it('does not treat typed conversation state as factual support by itself', async () => {
    const executeCurrent = vi.fn(async () => ({
      answer: 'Current provider refusal should not be approved.',
      refusal: true,
      citations: [],
      diagnostics: { queryIntent: 'contextual_followup' },
    }))

    const result = await runInternalAgentActivatedTurn({
      request: request({
        latestUserMessage: 'ingilizcesi?',
        recentMessages: [
          { role: 'user', content: 'tıp kaç para' },
          { role: 'assistant', content: 'Tıp Fakültesi ücreti 720.000 TL.' },
        ],
      }),
      executeCurrent,
      createPlannerCompletion: completionWith({
        decision: 'research',
        claims: [
          {
            id: 'claim-1',
            question: 'Resolve the short follow-up against recent context.',
            required_evidence: 'Conversation state plus approved table evidence',
            risk: 'medium',
          },
        ],
        steps: [
          {
            id: 'step-1',
            tool: 'internal.typed_state',
            claim_ids: ['claim-1'],
            args: { source_groups: ['conversation_state'], latest_message: 'ingilizcesi?' },
            depends_on: [],
          },
          {
            id: 'step-2',
            tool: 'internal.table',
            claim_ids: ['claim-1'],
            args: { source_groups: ['brochure'], query: 'resolved follow-up' },
            depends_on: ['step-1'],
          },
        ],
        stop_conditions: ['supported'],
        reason: 'Need state then table evidence.',
        confidence: 0.86,
      }),
      enabled: true,
    })

    expect(executeCurrent).toHaveBeenCalledTimes(1)
    expect(result.result.answer).not.toBe('Current provider refusal should not be approved.')
    expect(result.diagnostics).toMatchObject({
      status: 'completed',
      decision: 'no_info',
      activated: true,
      fallbackToCurrent: false,
      plannedTools: ['internal.typed_state', 'internal.table'],
    })
  })

  it('treats strict catalog refusal boundaries as supported approved evidence', async () => {
    const executeCurrent = vi.fn(async () => ({
      answer: 'Hukuk Fakültesi onaylı program ve fakülte listesinde yer almıyor.',
      refusal: true,
      citations: [{ providerSourceId: 'catalog', title: 'Program Kataloğu' }],
      diagnostics: { strictVerdict: 'catalog_unsupported_existence' },
    }))

    const result = await runInternalAgentActivatedTurn({
      request: request({ latestUserMessage: 'Hukuk Fakülteniz var mı?' }),
      executeCurrent,
      createPlannerCompletion: completionWith({
        decision: 'research',
        claims: [
          {
            id: 'claim-1',
            question: 'Does the requested faculty exist in the approved catalog?',
            required_evidence: 'Approved structured catalog evidence or absence boundary',
            risk: 'medium',
          },
        ],
        steps: [
          {
            id: 'step-1',
            tool: 'internal.catalog',
            claim_ids: ['claim-1'],
            args: { source_groups: ['structured_catalog'], query: 'Hukuk Fakültesi var mı?' },
            depends_on: [],
          },
        ],
        stop_conditions: ['supported'],
        reason: 'Need catalog evidence.',
        confidence: 0.88,
      }),
      enabled: true,
    })

    expect(executeCurrent).toHaveBeenCalledTimes(1)
    expect(result.result.answer).toContain('yer almıyor')
    expect(result.diagnostics).toMatchObject({
      status: 'completed',
      decision: 'answer',
      activated: true,
      controller: {
        trace: {
          stopReason: 'all_claims_supported',
        },
      },
    })
  })

  it('falls open to the current provider when activation planning cannot produce a plan', async () => {
    const executeCurrent = vi.fn(async () => ({
      answer: 'Mevcut güvenli cevap.',
      refusal: false,
      citations: [],
      diagnostics: {},
    }))

    const result = await runInternalAgentActivatedTurn({
      request: request(),
      executeCurrent,
      createPlannerCompletion: vi.fn(async () => {
        throw new Error('planner unavailable')
      }),
      enabled: true,
    })

    expect(executeCurrent).toHaveBeenCalledTimes(1)
    expect(result.result.answer).toBe('Mevcut güvenli cevap.')
    expect(result.diagnostics).toMatchObject({
      status: 'error',
      reason: 'planner_error',
      fallbackToCurrent: true,
    })
  })

  it('falls open to the current provider when controller plan claims become inconsistent', async () => {
    const executeCurrent = vi.fn(async () => ({
      answer: 'Dil ve Konuşma Terapisi ücreti 490.000 TL.',
      refusal: false,
      citations: [{ providerSourceId: 'catalog', title: 'Program Ücretleri' }],
      diagnostics: { strictVerdict: 'catalog_program_fee_fact' },
    }))
    const createPlannerCompletion = vi
      .fn<AgentPlannerCreateCompletion>()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: 'research',
                claims: [
                  {
                    id: 'claim-1',
                    question: 'Resolve pending program slot for the requested price.',
                    required_evidence: 'Conversation state plus approved fee evidence',
                    risk: 'medium',
                  },
                ],
                steps: [
                  {
                    id: 'step-1',
                    tool: 'internal.typed_state',
                    claim_ids: ['claim-1'],
                    args: { source_groups: ['conversation_state'] },
                    depends_on: [],
                  },
                ],
                stop_conditions: ['claim supported'],
                reason: 'Latest message fills pending state.',
                confidence: 0.84,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      })
      .mockResolvedValue({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: 'research',
                claims: [
                  {
                    id: 'claim-2',
                    question: 'Changed claim after retry.',
                    required_evidence: 'Different evidence',
                    risk: 'medium',
                  },
                ],
                steps: [
                  {
                    id: 'step-1',
                    tool: 'internal.table',
                    claim_ids: ['claim-2'],
                    args: { source_groups: ['brochure'], query: 'Dil ve Konuşma Terapisi ücret' },
                    depends_on: [],
                  },
                ],
                stop_conditions: ['claim supported'],
                reason: 'Changed plan.',
                confidence: 0.84,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: 'research',
                claims: [
                  {
                    id: 'claim-2',
                    question: 'Changed claim after retry.',
                    required_evidence: 'Different evidence',
                    risk: 'medium',
                  },
                ],
                steps: [
                  {
                    id: 'step-1',
                    tool: 'internal.table',
                    claim_ids: ['claim-2'],
                    args: { source_groups: ['brochure'], query: 'Dil ve Konuşma Terapisi ücret' },
                    depends_on: [],
                  },
                ],
                stop_conditions: ['claim supported'],
                reason: 'Changed plan.',
                confidence: 0.84,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
      })

    const result = await runInternalAgentActivatedTurn({
      request: request({
        latestUserMessage: 'Dil ve Konuşma Terapisi',
        conversationState: {
          status: 'pending_clarification',
          activeIntent: 'price',
          requestedMetric: 'price',
          missingSlots: ['program'],
          originalQuestion: 'kaç para',
          latestClarification: 'Dil ve Konuşma Terapisi',
        },
      }),
      executeCurrent,
      createPlannerCompletion,
      enabled: true,
    })

    expect(createPlannerCompletion).toHaveBeenCalledTimes(3)
    expect(executeCurrent).toHaveBeenCalledTimes(1)
    expect(result.result.answer).toBe('Dil ve Konuşma Terapisi ücreti 490.000 TL.')
    expect(result.diagnostics).toMatchObject({
      status: 'error',
      reason: 'plan_claim_mismatch',
      activated: false,
      fallbackToCurrent: true,
      plannedTools: ['internal.typed_state'],
      controller: {
        trace: {
          stopReason: 'plan_claim_mismatch',
        },
      },
    })
  })
})
