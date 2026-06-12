import { afterEach, describe, expect, it, vi } from 'vitest'
import { runOpenAiFileSearchValidatedQuestion } from './openai-file-search-validated'

describe('runOpenAiFileSearchValidatedQuestion', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('retrieves File Search results, generates from evidence, and cites selected sources', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'Evet, ücretlere KDV dahildir.',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'izin.pdf',
              score: 0.9,
              text: 'Ücretsiz izin en fazla 1 yıl olabilir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Ücretsiz izin en fazla 1 yıl olabilir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Ücretsiz izin en fazla 1 yıl olabilir.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Ücretsiz izin sınırı ne?',
      createCompletion,
      citationSourcesByFilename: {
        'izin.pdf': {
          title: 'İzin Kullanımı Yönergesi',
          url: 'https://example.edu.tr/izin.pdf',
        },
      },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        input: 'Ücretsiz izin sınırı ne?',
        include: ['file_search_call.results'],
        tools: [expect.objectContaining({ type: 'file_search' })],
      })
    )
    expect(createCompletion).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer:
        'Ücretsiz izin en fazla 1 yıl olabilir.\n\nİsterseniz bu başlıkla ilgili başka bir ayrıntıyı da kaynaklardan kontrol edebilirim.\nhttps://example.edu.tr/izin.pdf',
      citations: [
        {
          providerSourceId: 'file_1',
          title: 'İzin Kullanımı Yönergesi',
          url: 'https://example.edu.tr/izin.pdf',
          quote: 'Ücretsiz izin en fazla 1 yıl olabilir.',
          score: 0.9,
        },
      ],
      refusal: false,
      usage: {
        inputTokens: 300,
        outputTokens: 40,
        totalTokens: 340,
        toolCalls: 1,
      },
    })
    expect(result.timingsMs.retrieval).toBeGreaterThanOrEqual(0)
    expect(result.timingsMs.generation).toBeGreaterThanOrEqual(0)
  })

  it('refuses when retrieval has no usable evidence', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'BİDB e-postası nedir?',
    })

    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      citations: [],
      refusal: true,
      usage: {
        inputTokens: 20,
        outputTokens: 3,
        totalTokens: 23,
        toolCalls: 1,
      },
    })
  })

  it('keeps validated answers unchanged when shadow mode is disabled', async () => {
    vi.stubEnv('INTERNAL_AGENT_SHADOW', '0')
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 },
    }))
    const internalAgentPlannerCreateCompletion = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      organizationId: 'org-1',
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'BİDB e-postası nedir?',
      internalAgentPlannerCreateCompletion,
    })

    expect(internalAgentPlannerCreateCompletion).not.toHaveBeenCalled()
    expect(result.answer).toBe('Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.')
    expect(result.usage).toMatchObject({
      inputTokens: 20,
      outputTokens: 3,
      totalTokens: 23,
      toolCalls: 1,
    })
    expect(result.diagnostics?.internalAgentShadow).toBeUndefined()
  })

  it('adds fail-open shadow diagnostics without changing answer, citations, refusal, or usage', async () => {
    vi.stubEnv('INTERNAL_AGENT_SHADOW', '1')
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 3, total_tokens: 23 },
    }))
    const internalAgentPlannerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: 'research',
              claims: [
                {
                  id: 'claim-1',
                  question: 'What is the official email?',
                  required_evidence: 'Direct official contact evidence',
                  risk: 'medium',
                },
              ],
              steps: [
                {
                  id: 'step-1',
                  tool: 'internal.file_search',
                  claim_ids: ['claim-1'],
                  args: { source_groups: ['knowledge_base'], query: 'BİDB e-postası' },
                  depends_on: [],
                },
              ],
              stop_conditions: ['direct evidence found'],
              reason: 'Need approved corpus evidence.',
              confidence: 0.74,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 30, total_tokens: 120 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      channel: 'demo_chat',
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'BİDB e-postası nedir?',
      internalAgentPlannerCreateCompletion,
    })

    expect(internalAgentPlannerCreateCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toBe('Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.')
    expect(result.citations).toEqual([])
    expect(result.refusal).toBe(true)
    expect(result.usage).toMatchObject({
      inputTokens: 20,
      outputTokens: 3,
      totalTokens: 23,
      toolCalls: 1,
    })
    expect(result.diagnostics?.internalAgentShadow).toMatchObject({
      status: 'completed',
      reason: 'Need approved corpus evidence.',
      plannedDecision: 'research',
      observedDecision: 'no_info',
      plannedTools: ['internal.file_search'],
      observedTools: ['internal.typed_state'],
      missingPlannedTools: ['internal.file_search'],
      extraObservedTools: ['internal.typed_state'],
      claimCount: 1,
      plannerConfidence: 0.74,
      inputTokens: 90,
      outputTokens: 30,
    })
  })

  it('hydrates activation typed state from pending clarification before planner runs', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-test')
    vi.stubEnv('INTERNAL_AGENT_ACTIVATION', '1')
    vi.stubEnv('INTERNAL_AGENT_SHADOW', '0')
    const create = vi.fn(async () => ({
      id: 'resp_programs',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_programs',
              filename: 'programs.md',
              score: 0.9,
              text: 'Tüm programlar lisans ve ön lisans başlıkları altında listelenir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 70, output_tokens: 7, total_tokens: 77 },
    }))
    const internalAgentPlannerCreateCompletion = vi.fn(async (args: Record<string, unknown>) => {
      const messages = args.messages as Array<{ role: string; content: string }>
      const userPayload = JSON.parse(messages[1]?.content ?? '{}') as Record<string, unknown>

      expect(userPayload.typed_state).toMatchObject({
        status: 'pending_clarification',
        activeIntent: 'program_list',
        requestedMetric: 'program_list',
        missingSlots: ['scope'],
        originalQuestion: 'hangi bölümlere kayıt olabilirim',
      })
      expect(userPayload.conversation_context_hints).toMatchObject({
        has_pending_clarification: true,
        latest_message_should_be_checked_against_pending_state: true,
      })

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                decision: 'research',
                claims: [
                  {
                    id: 'claim-1',
                    question: 'Resolve the pending scope and retrieve all available programs.',
                    required_evidence: 'Conversation state plus approved catalog evidence',
                    risk: 'low',
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
                  {
                    id: 'step-2',
                    tool: 'internal.catalog',
                    claim_ids: ['claim-1'],
                    args: { source_groups: ['structured_catalog'], query: 'resolved requested list' },
                    depends_on: ['step-1'],
                  },
                ],
                stop_conditions: ['claim supported'],
                clarification: null,
                reason: 'Planner inspected typed state.',
                confidence: 0.86,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 32, total_tokens: 152 },
      }
    })
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Tüm programlar lisans ve ön lisans başlıkları altında listelenir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Tüm programlar lisans ve ön lisans başlıkları altında listelenir.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 110, completion_tokens: 18, total_tokens: 128 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      organizationId: 'org-1',
      conversationId: 'conversation-1',
      channel: 'demo_chat',
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'tümü',
      pendingClarification: {
        originalQuestion: 'hangi bölümlere kayıt olabilirim',
        clarificationQuestion:
          'Burslu programları mı, yoksa genel olarak tüm programları mı görmek istiyorsunuz?',
        requestedMetric: 'program_list',
        retrievalIntent: 'program_list',
        missingSlots: ['scope'],
      },
      conversationHistory: [
        { role: 'user', content: 'hangi bölümlere kayıt olabilirim' },
        {
          role: 'assistant',
          content:
            'Burslu programları mı, yoksa genel olarak tüm programları mı görmek istiyorsunuz?',
        },
      ],
      internalAgentPlannerCreateCompletion,
      createCompletion,
    })

    expect(create).toHaveBeenCalledOnce()
    expect(internalAgentPlannerCreateCompletion).toHaveBeenCalled()
    expect(result.answer).toContain('Tüm programlar')
    expect(result.diagnostics?.internalAgentActivation).toMatchObject({
      status: 'completed',
      decision: 'answer',
      activated: true,
    })
  })

  it('uses recent conversation history to clarify ambiguous continuation messages before retrieval', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'clarify',
              reason: 'ambiguous_assistant_offer',
              rewritten_question: '',
              clarification_question:
                'Tıp için hangi ayrıntıyı kontrol edeyim: eğitim süresi mi, mezuniyet olanakları mı?',
              confidence: 0.92,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 180, completion_tokens: 34, total_tokens: 214 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'olur et',
      qualityMode: 'strict',
      contextualOrchestratorCreateCompletion,
      conversationHistory: [
        { role: 'user', content: "tip'ta burslu program var mı" },
        {
          role: 'assistant',
          content:
            'İsterseniz bu programlardan birinin eğitim süresi veya mezuniyet olanaklarını da kaynaklardan kontrol edebilirim.',
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(contextualOrchestratorCreateCompletion).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Tıp için hangi ayrıntıyı kontrol edeyim: eğitim süresi mi, mezuniyet olanakları mı?',
      citations: [],
      refusal: false,
      usage: {
        inputTokens: 180,
        outputTokens: 34,
        totalTokens: 214,
        toolCalls: 0,
      },
      diagnostics: {
        contextualOrchestration: 'clarify',
        clarification: 'ambiguous_assistant_offer',
      },
    })
    expect(result.answer).not.toContain('Olur et hakkında')
  })

  it('runs global intake before retrieval for standalone off-topic messages', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'off_topic',
              action: 'refuse',
              route: 'off_topic_boundary',
              domain_relevance: 'out_of_scope',
              reason: 'latest message asks for a recipe outside the organization scope',
              resolved_user_intent: 'makarna tarifi',
              should_retrieve: false,
              safety_class: 'off_topic',
              answer_policy: 'redirect_to_supported_scope',
              refusal_answer:
                'Bu konuda yardımcı olamam; ancak üniversitenin programları, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreci hakkında yardımcı olabilirim.',
              confidence: 0.96,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 150, completion_tokens: 38, total_tokens: 188 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'makarna nasıl yapılır',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(contextualOrchestratorCreateCompletion).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer:
        'Bu konuda yardımcı olamam; ancak üniversitenin programları, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreci hakkında yardımcı olabilirim.',
      citations: [],
      refusal: true,
      diagnostics: {
        queryIntent: 'contextual_followup',
        contextualOrchestration: 'refuse',
        contextualTurnType: 'off_topic',
        contextualRoute: 'off_topic_boundary',
        contextualDomainRelevance: 'out_of_scope',
        contextualShouldRetrieve: false,
        contextualSafetyClass: 'off_topic',
        contextualAnswerPolicy: 'redirect_to_supported_scope',
      },
    })
  })

  it('passes compiled behavior policy into orchestration and exposes it in diagnostics', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async (args: Record<string, unknown>) => {
      const messages = args.messages as Array<{ role: string; content: string }>
      expect(messages.map((message) => message.content).join('\n')).toContain(
        'Compiled behavior policy'
      )
      expect(messages.map((message) => message.content).join('\n')).toContain(
        '"source_priority": ['
      )
      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                turn_type: 'off_topic',
                action: 'refuse',
                route: 'off_topic_boundary',
                domain_relevance: 'out_of_scope',
                reason: 'recipe outside business scope',
                should_retrieve: false,
                answer_policy: 'redirect_to_supported_scope',
                refusal_answer: 'Bu konuda yardımcı olamam. Kurumla ilgili sorularınızı yanıtlayabilirim.',
                confidence: 0.95,
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 },
      }
    })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'kahve tarifi verir misin',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
      settings: {
        bot_name: 'YİÜ Tanıtım Asistanı',
        prompt:
          'Öncelik sırası: önce tanıtım broşürü, sonra web sitesi HTML, sonra PDF. Belgeye dayanması gereken bilgiler: ücretler, kontenjanlar, ödeme ve resmi iletişim kanalları. Ton sıcak ve kısa olsun.',
      },
    })

    expect(create).not.toHaveBeenCalled()
    expect(result.diagnostics?.behaviorPolicy).toMatchObject({
      sourcePriority: ['brochure', 'website_html', 'approved_pdf'],
      evidenceRequiredFor: expect.arrayContaining(['pricing', 'payments', 'contacts']),
      tone: expect.arrayContaining(['warm', 'concise']),
    })
  })

  it('emits typed conversation state for contextual clarification turns', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'clarify',
              route: 'clarify_missing_slots',
              domain_relevance: 'in_scope',
              reason: 'program missing for price question',
              should_retrieve: false,
              missing_slots: ['program'],
              retrieval_intent: 'price',
              requested_metric: 'price',
              source_preference: ['primary_campaign_material'],
              answer_policy: 'ask_one_slot_clarification',
              clarification_question: 'Hangi programın ücretini öğrenmek istiyorsunuz?',
              confidence: 0.92,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'kaç para',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(result.diagnostics?.typedConversationState).toMatchObject({
      status: 'pending_clarification',
      activeIntent: 'price',
      requestedMetric: 'price',
      missingSlots: ['program'],
      sourcePreference: ['primary_campaign_material'],
    })
  })

  it('turns contextual boundary classifications into safe refusals even without refusal text', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'off_topic',
              action: 'refuse',
              route: 'off_topic_boundary',
              domain_relevance: 'out_of_scope',
              reason: 'latest message asks for a recipe outside the business scope',
              should_retrieve: false,
              confidence: 0.94,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 150, completion_tokens: 22, total_tokens: 172 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'makarna nasıl yapılır',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      citations: [],
      refusal: true,
      diagnostics: {
        contextualOrchestration: 'refuse',
        contextualTurnType: 'off_topic',
        contextualRoute: 'off_topic_boundary',
        contextualDomainRelevance: 'out_of_scope',
        contextualShouldRetrieve: false,
      },
    })
    expect(result.answer).toContain('yardımcı olamam')
  })

  it('does not treat unrelated non-question follow-ups as clarification answers', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'off_topic',
              action: 'refuse',
              route: 'off_topic_boundary',
              domain_relevance: 'out_of_scope',
              reason: 'latest message is an unrelated recipe request after a clarification question',
              should_retrieve: false,
              confidence: 0.95,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 210, completion_tokens: 30, total_tokens: 240 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'kahve tarifi',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
      conversationHistory: [
        { role: 'user', content: 'taban puan' },
        {
          role: 'assistant',
          content: 'Hangi program ve burs/indirim türü için taban puanı öğrenmek istiyorsunuz?',
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      citations: [],
      refusal: true,
      diagnostics: {
        contextualOrchestration: 'refuse',
        contextualTurnType: 'off_topic',
        contextualRoute: 'off_topic_boundary',
        contextualDomainRelevance: 'out_of_scope',
      },
    })
    expect(result.answer).not.toContain('taban puan')
    expect(result.answer).not.toContain('kahve tarifi hakkında')
  })

  it('runs global intake before retrieval for standalone under-specified messages', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'clarify',
              route: 'clarify_missing_slots',
              domain_relevance: 'in_scope',
              reason: 'fee question is missing the program name',
              resolved_user_intent: 'program fee',
              should_retrieve: false,
              missing_slots: ['program'],
              retrieval_intent: 'price',
              requested_metric: 'price',
              answer_policy: 'ask_one_slot_clarification',
              clarification_question: 'Hangi bölüm veya programın ücretini öğrenmek istiyorsunuz?',
              confidence: 0.94,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 144, completion_tokens: 34, total_tokens: 178 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'kaç para',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Hangi bölüm veya programın ücretini öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
      diagnostics: {
        contextualOrchestration: 'clarify',
        contextualTurnType: 'new_question',
        contextualRoute: 'clarify_missing_slots',
        contextualDomainRelevance: 'in_scope',
        contextualMissingSlots: ['program'],
        contextualRequestedMetric: 'price',
        contextualShouldRetrieve: false,
        contextualAnswerPolicy: 'ask_one_slot_clarification',
        pendingClarification: {
          originalQuestion: 'kaç para',
          clarificationQuestion: 'Hangi bölüm veya programın ücretini öğrenmek istiyorsunuz?',
          missingSlots: ['program'],
          requestedMetric: 'price',
          retrievalIntent: 'price',
        },
      },
    })
  })

  it('repairs long answers to previous clarification questions before retrieval', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_programs',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_programs',
              filename: 'programs.md',
              score: 0.93,
              text:
                'Kayıt olunabilecek programlar arasında Tıp Fakültesi, Sağlık Bilimleri Fakültesi bölümleri ve meslek yüksekokulu programları bulunur.',
            },
          ],
        },
      ],
      usage: { input_tokens: 90, output_tokens: 8, total_tokens: 98 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'standalone',
              reason: 'misread_clarification_answer_as_new_message',
              rewritten_question: 'Genel olarak tüm bölümler hakkında bilgi almak istiyorum.',
              clarification_question: '',
              confidence: 0.88,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 180, completion_tokens: 24, total_tokens: 204 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Kayıt olunabilecek programlar arasında Tıp Fakültesi, Sağlık Bilimleri Fakültesi bölümleri ve meslek yüksekokulu programları bulunur.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                'Kayıt olunabilecek programlar arasında Tıp Fakültesi, Sağlık Bilimleri Fakültesi bölümleri ve meslek yüksekokulu programları bulunur.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 160, completion_tokens: 26, total_tokens: 186 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Genel olarak tüm bölümler hakkında bilgi almak istiyorum.',
      qualityMode: 'strict',
      contextualOrchestratorCreateCompletion,
      createCompletion,
      conversationHistory: [
        { role: 'user', content: 'hangi bölümlere kayıt olabilirim' },
        {
          role: 'assistant',
          content:
            'Burslu programlar mı yoksa genel olarak tüm bölümler mi hakkında bilgi almak istiyorsunuz?',
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'rewrite',
      contextualReason: 'clarification_answer_rewrite',
      strictVerdict: 'catalog_degree_level_listing',
    })
    expect(result.answer).not.toContain('Burslu programlar mı yoksa')
    expect(result.answer).toContain('Lisans programları')
  })

  it('uses the enriched orchestration contract for clarification answers', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_programs',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_programs',
              filename: 'programs.md',
              score: 0.91,
              text:
                'Kayıt olunabilecek tüm programlar broşürde fakülte ve meslek yüksekokulu başlıkları altında listelenir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 80, output_tokens: 7, total_tokens: 87 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'clarification_answer',
              action: 'rewrite',
              reason: 'user_selected_general_scope_from_previous_clarification',
              resolved_user_intent:
                'Kullanıcı kayıt olunabilecek tüm bölümler ve programlar hakkında bilgi almak istiyor.',
              rewritten_question:
                'Önceki soru: hangi bölümlere kayıt olabilirim\nKullanıcının netleştirmesi: tüm bölümler hakkında bilgi almak istiyorum',
              original_user_question_used: 'hangi bölümlere kayıt olabilirim',
              latest_user_clarification_used: 'tüm bölümler hakkında bilgi almak istiyorum',
              should_retrieve: true,
              do_not_retrieve_text: [
                'Burslu programlar mı yoksa genel olarak tüm bölümler mi hakkında bilgi almak istiyorsunuz?',
              ],
              retrieval_intent: 'program_list',
              source_preference: ['primary_campaign_material', 'website_html', 'approved_pdf'],
              risk_level: 'medium',
              confidence: 0.95,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 230, completion_tokens: 60, total_tokens: 290 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Kayıt olunabilecek tüm programlar broşürde fakülte ve meslek yüksekokulu başlıkları altında listelenir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                'Kayıt olunabilecek tüm programlar broşürde fakülte ve meslek yüksekokulu başlıkları altında listelenir.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 140, completion_tokens: 20, total_tokens: 160 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'tüm bölümler hakkında bilgi almak istiyorum',
      qualityMode: 'strict',
      contextualOrchestratorCreateCompletion,
      createCompletion,
      conversationHistory: [
        { role: 'user', content: 'hangi bölümlere kayıt olabilirim' },
        {
          role: 'assistant',
          content:
            'Burslu programlar mı yoksa genel olarak tüm bölümler mi hakkında bilgi almak istiyorsunuz?',
        },
      ],
    })

    const orchestratorArgs = contextualOrchestratorCreateCompletion.mock.calls[0]?.[0] as {
      messages?: Array<{ role: string; content: string }>
    }
    const systemPrompt = orchestratorArgs.messages?.find((message) => message.role === 'system')
      ?.content
    expect(systemPrompt).toContain('turn_type')
    expect(systemPrompt).toContain('clarification_answer')
    expect(systemPrompt).toContain('do_not_retrieve_text')
    expect(systemPrompt).toContain('Example')

    expect(create).not.toHaveBeenCalled()
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'rewrite',
      contextualReason: 'user_selected_general_scope_from_previous_clarification',
      contextualTurnType: 'clarification_answer',
      contextualResolvedIntent:
        'Kullanıcı kayıt olunabilecek tüm bölümler ve programlar hakkında bilgi almak istiyor.',
      contextualOriginalQuestion: 'hangi bölümlere kayıt olabilirim',
      contextualLatestClarification: 'tüm bölümler hakkında bilgi almak istiyorum',
      contextualDoNotRetrieveText: [
        'Burslu programlar mı yoksa genel olarak tüm bölümler mi hakkında bilgi almak istiyorsunuz?',
      ],
      contextualRetrievalIntent: 'program_list',
      contextualSourcePreference: ['primary_campaign_material', 'website_html', 'approved_pdf'],
      contextualRiskLevel: 'medium',
      strictVerdict: 'catalog_degree_level_listing',
    })
    expect(result.answer).toContain('Lisans programları')
  })

  it('uses generic pending clarification state when the LLM misreads a follow-up as standalone', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_services',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_services',
              filename: 'services.md',
              score: 0.9,
              text: 'Tüm hizmet paketleri başlangıç, profesyonel ve kurumsal seçenekler olarak listelenir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 70, output_tokens: 7, total_tokens: 77 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'standalone',
              reason: 'misread_short_followup_without_state',
              rewritten_question: 'tümü',
              should_retrieve: true,
              confidence: 0.91,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 210, completion_tokens: 24, total_tokens: 234 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Tüm hizmet paketleri başlangıç, profesyonel ve kurumsal seçenekler olarak listelenir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                'Tüm hizmet paketleri başlangıç, profesyonel ve kurumsal seçenekler olarak listelenir.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 140, completion_tokens: 20, total_tokens: 160 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'tümü',
      contextualOrchestratorCreateCompletion,
      createCompletion,
      pendingClarification: {
        originalQuestion: 'hangi hizmet paketlerine kayıt olabilirim',
        clarificationQuestion: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        requestedMetric: 'service_list',
        retrievalIntent: 'service_list',
        missingSlots: ['scope'],
        sourcePreference: ['primary_campaign_material', 'website_html'],
        riskLevel: 'low',
      },
      conversationHistory: [
        { role: 'user', content: 'hangi hizmet paketlerine kayıt olabilirim' },
        {
          role: 'assistant',
          content: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        },
      ],
    })

    expect(contextualOrchestratorCreateCompletion).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('hangi hizmet paketlerine kayıt olabilirim'),
      })
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('Kullanıcının netleştirmesi: tümü'),
      })
    )
    expect(create).not.toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('Bireysel paketleri mi yoksa'),
      })
    )
    expect(result.answer).toContain('Tüm hizmet paketleri')
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'rewrite',
      contextualReason: 'pending_clarification_state_rewrite',
      contextualTurnType: 'clarification_answer',
      contextualOriginalQuestion: 'hangi hizmet paketlerine kayıt olabilirim',
      contextualLatestClarification: 'tümü',
      contextualRequestedMetric: 'service_list',
      contextualRetrievalIntent: 'service_list',
      contextualSourcePreference: ['primary_campaign_material', 'website_html'],
      contextualRiskLevel: 'low',
      pendingClarificationUsed: true,
    })
  })

  it('does not consume pending clarification state when the latest message is a fresh question', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_hours',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_hours',
              filename: 'hours.md',
              score: 0.88,
              text: 'Çalışma saatleri hafta içi 09.00-18.00 olarak belirtilmiştir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 60, output_tokens: 6, total_tokens: 66 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'standalone',
              reason: 'fresh_question_after_pending_clarification',
              rewritten_question: 'çalışma saatleri nedir?',
              should_retrieve: true,
              confidence: 0.94,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 210, completion_tokens: 24, total_tokens: 234 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Çalışma saatleri hafta içi 09.00-18.00 olarak belirtilmiştir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Çalışma saatleri hafta içi 09.00-18.00 olarak belirtilmiştir.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 18, total_tokens: 138 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'çalışma saatleri nedir?',
      contextualOrchestratorCreateCompletion,
      createCompletion,
      pendingClarification: {
        originalQuestion: 'hangi hizmet paketlerine kayıt olabilirim',
        clarificationQuestion: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        requestedMetric: 'service_list',
        retrievalIntent: 'service_list',
        missingSlots: ['scope'],
      },
      conversationHistory: [
        { role: 'user', content: 'hangi hizmet paketlerine kayıt olabilirim' },
        {
          role: 'assistant',
          content: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'çalışma saatleri nedir?',
      })
    )
    expect(result.answer).toContain('Çalışma saatleri')
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'standalone',
      contextualReason: 'fresh_question_after_pending_clarification',
    })
    expect(result.diagnostics).not.toMatchObject({
      pendingClarificationUsed: true,
    })
  })

  it('honors LLM state_decision ignore over a stale pending clarification', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_hours',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_hours',
              filename: 'hours.md',
              score: 0.89,
              text: 'Ziyaret saatleri hafta içi 09.00-18.00 olarak duyurulmuştur.',
            },
          ],
        },
      ],
      usage: { input_tokens: 60, output_tokens: 6, total_tokens: 66 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'standalone',
              reason: 'fresh_question_after_pending_state',
              rewritten_question: 'ziyaret saatleri nedir?',
              state_decision: 'ignore',
              state_confidence: 0.93,
              state_reason: 'latest user asks a new independent question',
              consumed_pending_state: false,
              should_retrieve: true,
              confidence: 0.94,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 220, completion_tokens: 32, total_tokens: 252 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Ziyaret saatleri hafta içi 09.00-18.00 olarak duyurulmuştur.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Ziyaret saatleri hafta içi 09.00-18.00 olarak duyurulmuştur.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 18, total_tokens: 138 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'ziyaret saatleri nedir?',
      contextualOrchestratorCreateCompletion,
      createCompletion,
      pendingClarification: {
        originalQuestion: 'hangi hizmet paketlerine kayıt olabilirim',
        clarificationQuestion: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        requestedMetric: 'service_list',
        retrievalIntent: 'service_list',
        missingSlots: ['scope'],
      },
      conversationHistory: [
        { role: 'user', content: 'hangi hizmet paketlerine kayıt olabilirim' },
        {
          role: 'assistant',
          content: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'ziyaret saatleri nedir?',
      })
    )
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'standalone',
      contextualStateDecision: 'ignore',
      contextualStateConfidence: 0.93,
      contextualStateReason: 'latest user asks a new independent question',
      contextualConsumedPendingState: false,
    })
    expect(result.diagnostics).not.toMatchObject({
      pendingClarificationUsed: true,
    })
  })

  it('marks unsafe fresh follow-ups as ignored pending state when the LLM refuses without state fields', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'unsafe_or_private_action',
              action: 'refuse',
              reason: 'latest user asks to share private payment data',
              refusal_answer: 'Kredi kartı bilgilerinizi burada paylaşmayın.',
              confidence: 0.95,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 220, completion_tokens: 28, total_tokens: 248 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'kredi kartımı yazsam ödeme alır mısın',
      contextualOrchestratorCreateCompletion,
      pendingClarification: {
        originalQuestion: 'hangi hizmet paketlerine kayıt olabilirim',
        clarificationQuestion: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        requestedMetric: 'service_list',
        retrievalIntent: 'service_list',
        missingSlots: ['scope'],
      },
      conversationHistory: [
        { role: 'user', content: 'hangi hizmet paketlerine kayıt olabilirim' },
        {
          role: 'assistant',
          content: 'Bireysel paketleri mi yoksa tüm paketleri mi görmek istersiniz?',
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      answer: 'Kredi kartı bilgilerinizi burada paylaşmayın.',
      refusal: true,
    })
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'refuse',
      contextualStateDecision: 'ignore',
      contextualConsumedPendingState: false,
    })
    expect(result.diagnostics).not.toMatchObject({
      pendingClarificationUsed: true,
    })
  })

  it('honors LLM state_decision split for a clarification answer plus a new facet', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_split',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_programs',
              filename: 'programs.md',
              score: 0.9,
              text: 'Tüm programlar ve ücret bilgileri ayrı başlıklar altında duyurulmuştur.',
            },
          ],
        },
      ],
      usage: { input_tokens: 70, output_tokens: 7, total_tokens: 77 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'multi_question',
              action: 'rewrite',
              reason: 'clarification_answer_with_new_related_facet',
              rewritten_question:
                'Önceki soru: hangi bölümlere kayıt olabilirim\nKullanıcının netleştirmesi ve ek sorusu: tümü, ücretleri de yaz',
              state_decision: 'split',
              state_confidence: 0.9,
              state_reason: 'latest user fills scope and asks fees too',
              consumed_pending_state: true,
              retrieval_intent: 'program_list',
              requested_metric: 'program_list',
              should_retrieve: true,
              confidence: 0.9,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 220, completion_tokens: 42, total_tokens: 262 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Tüm programlar ve ücret bilgileri ayrı başlıklar altında duyurulmuştur.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                'Tüm programlar ve ücret bilgileri ayrı başlıklar altında duyurulmuştur.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 140, completion_tokens: 20, total_tokens: 160 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'tümü, ücretleri de yaz',
      contextualOrchestratorCreateCompletion,
      createCompletion,
      pendingClarification: {
        originalQuestion: 'hangi bölümlere kayıt olabilirim',
        clarificationQuestion:
          'Burslu programları mı, yoksa genel olarak tüm programları mı görmek istiyorsunuz?',
        requestedMetric: 'program_list',
        retrievalIntent: 'program_list',
        missingSlots: ['scope'],
      },
      conversationHistory: [
        { role: 'user', content: 'hangi bölümlere kayıt olabilirim' },
        {
          role: 'assistant',
          content:
            'Burslu programları mı, yoksa genel olarak tüm programları mı görmek istiyorsunuz?',
        },
      ],
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('Kullanıcının netleştirmesi ve ek sorusu: tümü, ücretleri de yaz'),
      })
    )
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'rewrite',
      contextualReason: 'pending_clarification_state_split',
      contextualTurnType: 'multi_question',
      contextualStateDecision: 'split',
      contextualConsumedPendingState: true,
      pendingClarificationUsed: true,
    })
  })

  it('asks clarification instead of retrieval when orchestration confidence is too low', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'scope_selection',
              action: 'rewrite',
              reason: 'low_confidence_scope_resolution',
              rewritten_question: 'program detayları',
              clarification_question: 'Hangi program veya konuyu kastettiğinizi netleştirir misiniz?',
              should_retrieve: true,
              confidence: 0.31,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 30, total_tokens: 230 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'şunu da anlatır mısın',
      qualityMode: 'strict',
      contextualOrchestratorCreateCompletion,
      conversationHistory: [
        { role: 'user', content: 'programlar hakkında bilgi verir misin' },
        {
          role: 'assistant',
          content:
            'İsterseniz programların eğitim süresi veya mezuniyet olanaklarını da kontrol edebilirim.',
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      answer: 'Hangi program veya konuyu kastettiğinizi netleştirir misiniz?',
      refusal: false,
      diagnostics: {
        contextualOrchestration: 'clarify',
        contextualReason: 'low_confidence_contextual_orchestration',
        contextualTurnType: 'scope_selection',
        clarification: 'low_confidence_contextual_orchestration',
      },
    })
  })

  it('tries configured primary source groups before the broader approved corpus', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'resp_brochure',
        output_text: 'brochure retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'file_brochure',
                filename: 'brochure.md',
                score: 0.93,
                text: 'Tanıtım broşüründe aday öğrencilere yönelik programlar ve kampüs bilgileri özetlenir.',
              },
            ],
          },
        ],
        usage: { input_tokens: 40, output_tokens: 5, total_tokens: 45 },
      })
      .mockResolvedValueOnce({
        id: 'resp_broad',
        output_text: 'broad retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'file_website',
                filename: 'website.md',
                score: 0.88,
                text: 'Website HTML içeriğinde aday öğrenci sayfası ve genel tanıtım bilgileri bulunur.',
              },
            ],
          },
        ],
        usage: { input_tokens: 50, output_tokens: 6, total_tokens: 56 },
      })
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Tanıtım broşüründe aday öğrencilere yönelik programlar ve kampüs bilgileri özetlenir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                'Tanıtım broşüründe aday öğrencilere yönelik programlar ve kampüs bilgileri özetlenir.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 20, total_tokens: 140 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Aday öğrenciler için üniversitenizi kısaca tanıtır mısın?',
      sourcePriorityGroups: ['brochure-overview-contact', 'brochure-campus-program-map'],
      createCompletion,
      citationSourcesByFilename: {
        'brochure.md': {
          title: 'Tanıtım Broşürü',
        },
        'website.md': {
          title: 'Website Aday Öğrenci',
        },
      },
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['brochure-overview-contact', 'brochure-campus-program-map'],
            },
          }),
        ],
      })
    )
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        tools: [expect.not.objectContaining({ filters: expect.anything() })],
      })
    )
    expect(createCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toContain(
      'Tanıtım broşüründe aday öğrencilere yönelik programlar ve kampüs bilgileri özetlenir.'
    )
    expect(result.citations[0]).toMatchObject({
      providerSourceId: 'file_brochure',
      title: 'Tanıtım Broşürü',
    })
    expect(result.diagnostics).toMatchObject({
      sourcePriority: {
        primarySourceGroups: ['brochure-overview-contact', 'brochure-campus-program-map'],
        used: true,
      },
    })
    expect(result.usage).toMatchObject({
      inputTokens: 210,
      outputTokens: 31,
      totalTokens: 241,
      toolCalls: 2,
    })
  })

  it('runs LLM research planner hops and combines their evidence before answering', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        id: 'resp_hop_1',
        output_text: 'hop 1 complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'file_admissions',
                filename: 'admissions-page.md',
                score: 0.94,
                text: 'Aday öğrenci sayfasında fakülte ve bölümlere göz atma bilgisi yer alır.',
              },
            ],
          },
        ],
        usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 },
      })
      .mockResolvedValueOnce({
        id: 'resp_hop_2',
        output_text: 'hop 2 complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'file_brochure_summary',
                filename: 'brochure-summary.md',
                score: 0.91,
                text: 'Tanıtım broşüründe üniversitenin genel tanıtım özeti yer alır.',
              },
            ],
          },
        ],
        usage: { input_tokens: 60, output_tokens: 6, total_tokens: 66 },
      })
    const researchPlannerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              route: 'multi_hop_file_search',
              reason: 'Website admissions page and brochure summary require separate evidence hops.',
              required_evidence: ['admissions page evidence', 'brochure summary evidence'],
              confidence: 0.9,
              hops: [
                {
                  query: 'Aday öğrenci sayfası fakülte ve bölümlere göz atın',
                  source_groups: ['admissions'],
                  purpose: 'Find admissions page evidence.',
                  max_results: 8,
                },
                {
                  query: 'Tanıtım broşürü genel tanıtım özeti',
                  source_groups: ['brochure-overview-contact'],
                  purpose: 'Find brochure summary evidence.',
                  max_results: 8,
                },
              ],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Aday öğrenci sayfasında fakülte ve bölümlere göz atma bilgisi yer alır. Tanıtım broşüründe üniversitenin genel tanıtım özeti yer alır.',
              used_evidence_ids: ['ev_1', 'ev_2'],
              support_quotes: [
                'Aday öğrenci sayfasında fakülte ve bölümlere göz atma bilgisi yer alır.',
                'Tanıtım broşüründe üniversitenin genel tanıtım özeti yer alır.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Tanıtım kaynakları ve broşür özetini birlikte kaynaklardan kontrol eder misin?',
      qualityMode: 'strict',
      enableLlmResearchPlanner: true,
      researchPlannerCreateCompletion,
      createCompletion,
      citationSourcesByFilename: {
        'admissions-page.md': {
          title: 'Aday Öğrenci Sayfası',
        },
        'brochure-summary.md': {
          title: 'Tanıtım Broşürü Özeti',
        },
      },
    })

    expect(researchPlannerCreateCompletion).toHaveBeenCalledOnce()
    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        input: 'Aday öğrenci sayfası fakülte ve bölümlere göz atın',
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['admissions'],
            },
          }),
        ],
      })
    )
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: 'Tanıtım broşürü genel tanıtım özeti',
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['brochure-overview-contact'],
            },
          }),
        ],
      })
    )
    expect(createCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toContain(
      'Aday öğrenci sayfasında fakülte ve bölümlere göz atma bilgisi yer alır.'
    )
    expect(result.answer).toContain(
      'Tanıtım broşüründe üniversitenin genel tanıtım özeti yer alır.'
    )
    expect(result.citations).toHaveLength(2)
    expect(result.diagnostics).toMatchObject({
      llmResearchPlan: {
        route: 'multi_hop_file_search',
        used: true,
        hopCount: 2,
        requiredEvidence: ['admissions page evidence', 'brochure summary evidence'],
      },
      researchBlackboard: {
        attempts: [
          expect.objectContaining({
            stage: 'llm_research_hop',
            query: 'Aday öğrenci sayfası fakülte ve bölümlere göz atın',
            sourceGroups: ['admissions'],
          }),
          expect.objectContaining({
            stage: 'llm_research_hop',
            query: 'Tanıtım broşürü genel tanıtım özeti',
            sourceGroups: ['brochure-overview-contact'],
          }),
        ],
      },
    })
    expect(result.usage).toMatchObject({
      inputTokens: 240,
      outputTokens: 41,
      totalTokens: 281,
      toolCalls: 2,
    })
  })

  it('asks for clarification without retrieval when a price question lacks the target program or service', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Okumak kaç para?',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Hangi bölüm, program veya hizmet için ücret bilgisini öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
      },
      diagnostics: {
        queryIntent: 'general_approved_corpus',
        clarification: 'missing_price_subject',
      },
    })
  })

  it('asks for the target program before retrieving table metrics that require a row subject', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Taban puan nedir?',
      qualityMode: 'strict',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Hangi program ve burs/indirim türü için taban puanını öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
      diagnostics: {
        queryIntent: 'brochure_table_fact',
        clarification: 'missing_base_score_program',
        pendingClarification: {
          originalQuestion: 'Taban puan nedir?',
          clarificationQuestion:
            'Hangi program ve burs/indirim türü için taban puanını öğrenmek istiyorsunuz?',
          missingSlots: ['program', 'row_variant'],
          requestedMetric: 'base_score',
          retrievalIntent: 'base_score',
        },
      },
    })
  })

  it('asks what process or program is meant for bare day-count questions', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'kaç gün',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'disabled',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Hangi süreç, bölüm veya program için kaç gün olduğunu öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
      diagnostics: {
        queryIntent: 'general_approved_corpus',
        clarification: 'missing_day_count_subject',
        pendingClarification: {
          originalQuestion: 'kaç gün?',
          clarificationQuestion:
            'Hangi süreç, bölüm veya program için kaç gün olduğunu öğrenmek istiyorsunuz?',
          missingSlots: ['subject'],
        },
      },
    })
  })

  it('asks for the target program when a bare score question is underspecified', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'puan kaç',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'disabled',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Hangi program ve burs/indirim türü için taban puanını öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
      diagnostics: {
        queryIntent: 'general_approved_corpus',
        clarification: 'missing_base_score_program',
        pendingClarification: {
          originalQuestion: 'puan kaç?',
          clarificationQuestion:
            'Hangi program ve burs/indirim türü için taban puanını öğrenmek istiyorsunuz?',
          missingSlots: ['program', 'row_variant'],
          requestedMetric: 'base_score',
          retrievalIntent: 'base_score',
        },
      },
    })
  })

  it('uses the LLM research planner boundary route to stop off-topic retrieval', async () => {
    const create = vi.fn()
    const researchPlannerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              route: 'off_topic_boundary',
              reason: 'The user asks for general advice outside the approved business scope.',
              required_evidence: ['safe_refusal_boundary'],
              confidence: 0.91,
              hops: [],
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 22, total_tokens: 112 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'borsada nasıl para kazanılır',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'disabled',
      enableLlmResearchPlanner: true,
      researchPlannerCreateCompletion,
    })

    expect(researchPlannerCreateCompletion).toHaveBeenCalledOnce()
    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      citations: [],
      refusal: true,
      diagnostics: {
        strictVerdict: 'llm_research_boundary',
        llmResearchPlan: {
          route: 'off_topic_boundary',
          reason: 'The user asks for general advice outside the approved business scope.',
          requiredEvidence: ['safe_refusal_boundary'],
          used: true,
          hopCount: 0,
          confidence: 0.91,
        },
      },
    })
    expect(result.answer).toContain('yardımcı olamam')
  })

  it('asks for clarification without retrieval when a non-price question lacks the target subject', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Nerede?',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      provider: 'openai_file_search_validated',
      answer: 'Hangi bölüm, kampüs veya birimin konumunu öğrenmek istiyorsunuz?',
      citations: [],
      refusal: false,
      usage: {
        inputTokens: 0,
        outputTokens: 0,
        totalTokens: 0,
        toolCalls: 0,
      },
      diagnostics: {
        clarification: 'missing_location_subject',
      },
    })
  })

  it('answers natural program price phrasing from the brochure table instead of clarifying', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_tip',
              filename: 'brochure-01-tip.md',
              score: 0.95,
              text: [
                '| Puan Kodu | Bölüm Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
                '|---|---:|---:|---:|---:|---:|---:|',
                '| 207910033 | Tıp Fakültesi (Ücretli) | SAY | 75 | 36.073 | 453,467 | 720.000 |',
              ].join('\n'),
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }))
    const createCompletion = vi.fn()
    const presentationCreateCompletion = vi.fn(async (args: Record<string, unknown>) => {
      const messages = args.messages as Array<{ role: string; content: string }>
      const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''
      const userPrompt = messages.find((message) => message.role === 'user')?.content ?? ''

      expect(systemPrompt).toContain('Do not expose internal retrieval or source mechanics')
      expect(systemPrompt).toContain('brochure, document, PDF, website, table, row, field, citation')
      expect(systemPrompt).toContain('Bol emoji kullan, Gen-Z gibi konuş.')
      expect(userPrompt).toContain(
        'Tıp Fakültesi (Ücretli) için 2025 fiyatı 720.000 TL olarak broşürde gösterilmiştir.'
      )

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Tıp Fakültesi ücretli programının 2025 ücreti 720.000 TL.',
                engagement_question: '',
                engagement_evidence: '',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 70, completion_tokens: 10, total_tokens: 80 },
      }
    })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp kaç para?',
      createCompletion,
      presentationCreateCompletion,
      settings: {
        bot_name: 'Qualy',
        prompt: 'Bol emoji kullan, Gen-Z gibi konuş.',
      },
      citationSourcesByFilename: {
        'brochure-01-tip.md': {
          title: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
          url: 'https://example.edu.tr/brochure.pdf',
        },
      },
    })

    expect(create).toHaveBeenCalledOnce()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(presentationCreateCompletion).toHaveBeenCalledOnce()
    expect(result.refusal).toBe(false)
    expect(result.answer).toContain('Tıp Fakültesi ücretli programının 2025 ücreti 720.000 TL.')
    expect(result.answer).not.toContain('broşür')
    expect(result.answer).not.toContain('fiyat alanı')
    expect(result.answer).not.toContain('satır')
    expect(result.answer).toContain('https://example.edu.tr/brochure.pdf')
    expect(result.diagnostics).toMatchObject({
      presentationPolish: {
        usedPolish: true,
        addedEngagement: false,
        model: 'gpt-4o-mini',
      },
    })
  })

  it('uses a raw File Search answer only when retrieved evidence supports it', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'Ücretsiz izin en fazla 1 yıl olabilir.',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'izin.pdf',
              score: 0.9,
              text: 'Madde 11- Ücretsiz izinler aşağıdaki esaslara göre kullanılır. a) Ücretsiz izin süresi en fazla 1 (bir) yıldır.',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 12, total_tokens: 112 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'NO_ANSWER',
              used_evidence_ids: [],
              support_quotes: [],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 10, total_tokens: 210 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Ücretsiz izin sınırı ne?',
      createCompletion,
      citationSourcesByFilename: {
        'izin.pdf': {
          title: 'İzin Kullanımı Yönergesi',
          url: 'https://example.edu.tr/izin.pdf',
        },
      },
    })

    expect(result.refusal).toBe(false)
    expect(result.answer).toBe(
      'Ücretsiz izin en fazla 1 yıl olabilir.\n\nİsterseniz bu başlıkla ilgili başka bir ayrıntıyı da kaynaklardan kontrol edebilirim.\nhttps://example.edu.tr/izin.pdf'
    )
    expect(result.citations).toHaveLength(1)
  })

  it('rejects generic institution footer contacts for unit-specific contact questions', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'BİDB’nin e-posta adresi yiu@yiu.edu.tr olarak geçmektedir.',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'bidb.pdf',
              score: 0.9,
              text: 'BİLGİ İŞLEM DAİRE BAŞKANLIĞI\nAdres : Yüksek İhtisas Üniversitesi Rektörlüğü 06530 Telefon : 0312 329 10 10\nE-posta : yiu@yiu.edu.tr\nSayfa 5 / 7',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 12, total_tokens: 112 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'NO_ANSWER',
              used_evidence_ids: [],
              support_quotes: [],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 10, total_tokens: 210 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'BİDB’nin e-posta adresi nedir?',
      createCompletion,
      citationSourcesByFilename: {
        'bidb.pdf': {
          title: 'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi',
          url: 'https://example.edu.tr/bidb.pdf',
        },
      },
    })

    expect(result.refusal).toBe(true)
    expect(result.answer).toBe('Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.')
    expect(result.citations).toHaveLength(0)
  })

  it('canonicalizes no-clear raw answers as refusals without adjacent source links', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text:
        'Tıp Fakültesi için öğrenim ücreti konusunda yüklenen belgelerde net bir ücret bilgisi verilmemiştir. Ancak ücretler Mütevelli Heyeti tarafından belirlenir.',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'yonetmelik.pdf',
              score: 0.9,
              text: 'Öğrenim ücretleri Mütevelli Heyeti tarafından belirlenir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'NO_ANSWER',
              used_evidence_ids: [],
              support_quotes: [],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 10, total_tokens: 210 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp Fakültesi öğrenim ücreti ne kadar?',
      createCompletion,
      citationSourcesByFilename: {
        'yonetmelik.pdf': {
          title: 'Ön Lisans ve Lisans Eğitim-Öğretim ve Sınav Yönetmeliği',
          url: 'https://example.edu.tr/yonetmelik.pdf',
        },
      },
    })

    expect(result.refusal).toBe(true)
    expect(result.answer).toBe('Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.')
    expect(result.citations).toHaveLength(0)
  })

  it('prefers raw fallback citations that contain critical answer values', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text:
        'Özel öğrenci yönergesi, 06.10.2020 tarih ve 2020/87 sayılı Senato kararıyla kabul edilmiştir.',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'irrelevant.pdf',
              score: 0.9,
              text: 'Yatay geçiş yönergesi farklı bir senato kararıyla kabul edilmiştir.',
            },
            {
              file_id: 'file_2',
              filename: 'ozel.pdf',
              score: 0.8,
              text: 'Özel Öğrenci Yönergesi 06.10.2020 tarih ve 2020/87 sayılı Senato kararı ile kabul edilmiştir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'NO_ANSWER',
              used_evidence_ids: [],
              support_quotes: [],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 200, completion_tokens: 10, total_tokens: 210 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Özel öğrenci yönergesi hangi senato kararıyla kabul edilmiş?',
      createCompletion,
      citationSourcesByFilename: {
        'irrelevant.pdf': {
          title: 'Yatay Geçiş Yönergesi',
          url: 'https://example.edu.tr/yatay.pdf',
        },
        'ozel.pdf': {
          title: 'Özel Öğrenci Yönergesi',
          url: 'https://example.edu.tr/ozel.pdf',
        },
      },
    })

    expect(result.refusal).toBe(false)
    expect(result.citations).toMatchObject([
      {
        providerSourceId: 'file_2',
        title: 'Özel Öğrenci Yönergesi',
        url: 'https://example.edu.tr/ozel.pdf',
      },
    ])
    expect(result.answer).toContain('https://example.edu.tr/ozel.pdf')
    expect(result.answer).not.toContain('https://example.edu.tr/yatay.pdf')
  })

  it('uses a filtered brochure table row without invoking generic answer generation', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_tip',
              filename: 'brochure-01-tip.md',
              score: 0.95,
              text: [
                '| Puan Kodu | Bölüm Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
                '|---|---|---:|---:|---:|---:|---:|',
                '| - | Tıp Fakültesi (Hazırlık) | - | - | - | - | 410.000 |',
              ].join('\n'),
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Evet, ücretlere KDV dahildir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                '2025-2026 eğitim öğretim yılı program ücretleri tabloda listelenmiştir.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 70, completion_tokens: 10, total_tokens: 80 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-5.4-mini',
      answerModel: 'gpt-5.4-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp Fakültesi hazırlık ücreti ne kadar?',
      createCompletion,
      citationSourcesByFilename: {
        'brochure-01-tip.md': {
          title: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
          url: 'https://example.edu.tr/brochure.pdf',
        },
      },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: 'Tıp Fakültesi hazırlık ücreti ne kadar?',
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['brochure-program-fee-tip'],
            },
          }),
        ],
      })
    )
    expect(createCompletion).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      refusal: false,
      answer:
        'Tıp Fakültesi (Hazırlık) için 2025 fiyatı 410.000 TL olarak broşürde gösterilmiştir.\n\nİsterseniz bu başlıkla ilgili başka bir ayrıntıyı da kaynaklardan kontrol edebilirim.\nhttps://example.edu.tr/brochure.pdf',
      citations: [
        {
          providerSourceId: 'file_tip',
          title: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
        },
      ],
    })
  })

  it('runs one narrowed targeted retry when the first table retrieval misses the row', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
        output: [{ type: 'file_search_call', status: 'completed', results: [] }],
        usage: { input_tokens: 70, output_tokens: 8, total_tokens: 78 },
      })
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'file_shmyo',
                filename: 'brochure-04-shmyo.md',
                score: 0.96,
                text: [
                  '| Puan Kodu | Program Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
                  '|---|---|---:|---:|---:|---:|---:|',
                  '| 207950097 | Optisyenlik (Burslu) | TYT | 7 | 444.708 | 345,708 | - |',
                ].join('\n'),
              },
            ],
          },
        ],
        usage: { input_tokens: 90, output_tokens: 10, total_tokens: 100 },
      })
    const createCompletion = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-5.4-mini',
      vectorStoreId: 'vs_123',
      question: 'Optisyenlik burslu programının başarı sırası nedir?',
      createCompletion,
      citationSourcesByFilename: {
        'brochure-04-shmyo.md': {
          title: 'YİÜ Tanıtım Broşürü - SHMYO Kontenjan ve Ücretler',
          url: 'https://example.edu.tr/brochure.pdf',
        },
      },
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('Optisyenlik | Burslu | 2024 Başarı Sırası'),
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['brochure-program-fee-shmyo'],
            },
          }),
        ],
      })
    )
    expect(createCompletion).not.toHaveBeenCalled()
    expect(result.answer).toContain('2024 başarı sırası 444.708')
    expect(result.answer).not.toContain('başarı sırası 7')
    expect(result.usage.toolCalls).toBe(2)
  })

  it('answers document-router questions from an exact matching citation title', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_bidb',
              filename: 'bidb.pdf',
              score: 0.94,
              text: 'BİDB çalışma usul ve esasları bu yönergede açıklanır.',
            },
          ],
        },
      ],
      usage: { input_tokens: 80, output_tokens: 5, total_tokens: 85 },
    }))
    const createCompletion = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-5.4-mini',
      vectorStoreId: 'vs_123',
      question: 'BİDB çalışma yönergesinin adı nedir?',
      createCompletion,
      citationSourcesByFilename: {
        'bidb.pdf': {
          title: 'BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge',
          url: 'https://example.edu.tr/bidb.pdf',
        },
      },
    })

    expect(createCompletion).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      refusal: false,
      answer:
        "BİDB, Bilgi İşlem Daire Başkanlığı'nı ifade eder. İlgili yönergeler: BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge.\n\nİsterseniz bu yönergedeki ilgili şartları da kaynaklardan özetleyebilirim.\nhttps://example.edu.tr/bidb.pdf",
      citations: [
        {
          providerSourceId: 'file_bidb',
        },
      ],
    })
  })

  it('appends one validated brochure follow-up before the source link', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_tip',
              filename: 'brochure-01-tip.md',
              score: 0.95,
              text: [
                '| Puan Kodu | Bölüm Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
                '|---|---|---:|---:|---:|---:|---:|',
                '| 207910033 | Tıp Fakültesi (Ücretli) | SAY | 75 | 36.073 | 453,467 | 720.000 |',
                '| 207910015 | Tıp Fakültesi (Burslu) | SAY | 13 | 11.519 | 497,406 | - |',
                '| 207950202 | Tıp Fakültesi (%50 İnd.) | SAY | 10 | 18.145 | 483,077 | 360.000 |',
              ].join('\n'),
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-5.4-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp Fakültesi ücretli programının fiyatı nedir?',
      citationSourcesByFilename: {
        'brochure-01-tip.md': {
          title: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
          url: 'https://example.edu.tr/brochure.pdf',
        },
      },
    })

    expect(result.answer).toBe(
      [
        'Tıp Fakültesi (Ücretli) için 2025 fiyatı 720.000 TL olarak broşürde gösterilmiştir.',
        '',
        'İsterseniz Tıp Fakültesi için burslu ve %50 indirimli seçenekleri de karşılaştırabilirim.',
        'https://example.edu.tr/brochure.pdf',
      ].join('\n')
    )
  })

  it('blocks unsupported guarantees before retrieval', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Bugün bilgimi bırakırsam Tıp Fakültesi için bana kesin kontenjan ayırır mısınız?',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      refusal: true,
      diagnostics: {
        queryIntent: 'unsupported_guardrail',
        retryCount: 0,
        followup: expect.stringContaining('yardımcı'),
      },
    })
    expect(result.answer).toContain('garantisi')
    expect(result.answer).toContain('yardımcı')
  })

  it('routes website admissions questions through the admissions source group', async () => {
    const create = vi.fn(async () => ({
      output_text: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))

    await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'Aday öğrenci sayfasına göre üniversitede hangi fakülte ve yüksekokul grupları öne çıkıyor?',
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['admissions'],
            },
          }),
        ],
      })
    )
    expect(create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('Fakülte ve Bölümler'),
      })
    )
    expect(create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('Spor Bilimleri Fakültesi'),
      })
    )
  })

  it('retries website contact retrieval once when the first evidence misses required fields', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'contact-admin',
                filename: 'contact-admin.md',
                text: 'Öğrenci İşleri Daire Başkanlığı\n0 (312) 329 10 10',
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'contact-admin',
                filename: 'contact-admin.md',
                text: 'ogrenciisleri@yuksekihtisas.edu.tr\n0 (552) 994 05 41',
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'Öğrenci işleriyle konuşmam gerekirse web sitesinde hangi e-posta ve telefonlar görünüyor?',
      citationSourcesByFilename: {
        'contact-admin.md': {
          title: 'YİÜ Website - Contact Admin - 001',
        },
      },
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('Öğrenci İşleri Daire Başkanlığı'),
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['contact-admin'],
            },
          }),
        ],
      })
    )
    expect(result.answer).toContain('ogrenciisleri@yuksekihtisas.edu.tr')
    expect(result.answer).toContain('329 10 10')
    expect(result.diagnostics?.retryCount).toBe(1)
    expect(result.usage.toolCalls).toBe(2)
  })

  it('does not use student affairs evidence for rectorate contact questions and retries exact fields', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'contact-admin',
                filename: 'contact-admin.md',
                text: [
                  'Öğrenci İşleri Daire Başkanlığı(Tıp Fakültesi)',
                  '(+90 312) 329 10 10 (+90 552) 994 05 41',
                  'ogrenciisleri@yuksekihtisas.edu.tr',
                ].join('\n'),
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'contact-admin',
                filename: 'contact-admin.md',
                text: [
                  'Rektörlük ve Tıp Fakültesi',
                  'İŞÇİ BLOKLARI YERLEŞKESİ',
                  'İşçi Blokları Mahallesi 1505. Cd. No: 18/A, 06530 Çankaya/Ankara',
                  '+90 312 329 10 10',
                  'yiu@yiu.edu.tr',
                ].join('\n'),
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'Rektörlük ve Tıp Fakültesi için web sitesindeki adres, telefon ve genel e-posta nedir?',
      citationSourcesByFilename: {
        'contact-admin.md': {
          title: 'YİÜ Website - Contact Admin - 001',
        },
      },
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('Rektörlük ve Tıp Fakültesi'),
      })
    )
    expect(result.answer).toContain('İşçi Blokları')
    expect(result.answer).toContain('1505. Cd. No: 18/A')
    expect(result.answer).toContain('yiu@yiu.edu.tr')
    expect(result.answer).not.toContain('ogrenciisleri')
    expect(result.diagnostics?.retryCount).toBe(1)
  })

  it('answers supported transport-scope catalog boundaries before retrieval', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'campus-location',
                filename: 'campus.md',
                text: 'Kampüs Ankara içinde yer almaktadır.',
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'transport-service',
                filename: 'transport.md',
                text: 'Öğrenciler için kampüse ulaşım servisi bulunmaktadır.',
              },
            ],
          },
        ],
        usage: { input_tokens: 35, output_tokens: 5, total_tokens: 40 },
      })
    const createCompletion = vi
      .fn()
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Evet, kampüs Ankara içinde yer almaktadır.',
                used_evidence_ids: ['ev_1'],
                support_quotes: ['Kampüs Ankara içinde yer almaktadır.'],
                engagement_question: '',
                engagement_evidence_id: '',
                engagement_evidence: '',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 40, completion_tokens: 10, total_tokens: 50 },
      })
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer: 'Evet, kampüse ulaşım servisi bulunmaktadır.',
                used_evidence_ids: ['ev_1'],
                support_quotes: ['Öğrenciler için kampüse ulaşım servisi bulunmaktadır.'],
                engagement_question: '',
                engagement_evidence_id: '',
                engagement_evidence: '',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 50, completion_tokens: 10, total_tokens: 60 },
      })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Kampüse servis var mı?',
      qualityMode: 'strict',
      createCompletion,
      citationSourcesByFilename: {
        'campus.md': {
          title: 'Kampüs Bilgisi',
        },
        'transport.md': {
          title: 'Ulaşım Bilgisi',
        },
      },
    })

    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('servis hakkında onaylı kaynaklarda net bilgi bulunmamaktadır')
    expect(result.answer).toContain('resmi ulaşım duyurusu')
    expect(result.answer).not.toContain('kampüse ulaşım servisi bulunmaktadır')
    expect(result.diagnostics).toMatchObject({
      strictVerdict: 'catalog_campus_transport_scope_guard',
      researchPlan: expect.objectContaining({
        route: 'catalog_direct',
      }),
    })
  })

  it('retries website bilgi paketi retrieval when the first general evidence misses program names', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'general-001',
                filename: 'general-001.md',
                text: 'Tele-Sağlık Teknikerliği\nTıbbi Veri İşleme Teknikerliği\nFizyoterapi',
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'general-002',
                filename: 'general-002.md',
                text: [
                  'Vocational School of Health Services',
                  'Anestezi Programı',
                  'İlk ve Acil Yardım',
                  'Optisyenlik Programı',
                  'Tele-Sağlık Teknikerliği',
                ].join('\n'),
              },
            ],
          },
        ],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'Web sitesindeki bilgi paketine göre Sağlık Hizmetleri Meslek Yüksekokulu altında hangi programlardan bazıları listeleniyor?',
      citationSourcesByFilename: {
        'general-001.md': {
          title: 'YİÜ Website - General - 001',
        },
        'general-002.md': {
          title: 'YİÜ Website - General - 002',
        },
      },
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        input: expect.stringContaining('Anestezi Programı'),
        tools: [
          expect.objectContaining({
            filters: {
              type: 'in',
              key: 'source_group',
              value: ['general'],
            },
          }),
        ],
      })
    )
    expect(result.answer).toContain('Anestezi')
    expect(result.answer).toContain('İlk ve Acil Yardım')
    expect(result.answer).toContain('Optisyenlik')
    expect(result.answer).toContain('Tele-Sağlık Teknikerliği')
    expect(result.diagnostics?.retryCount).toBe(1)
  })

  it('falls back to the approved source catalog for document-router questions', async () => {
    const create = vi.fn(async () => ({
      output_text: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))
    const createCompletion = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Yaz okulunda ders alma koşullarını ve işlemleri nereden öğrenebilirim?',
      createCompletion,
      citationSourcesByFilename: {
        'yaz-ogretimi.pdf': {
          title: 'Yaz Öğretimi Yönergesi',
          url: 'https://example.edu.tr/yaz-ogretimi.pdf',
        },
        'izin.pdf': {
          title: 'İzin Kullanımı Yönergesi',
          url: 'https://example.edu.tr/izin.pdf',
        },
      },
    })

    expect(createCompletion).not.toHaveBeenCalled()
    expect(result).toMatchObject({
      refusal: false,
      citations: [
        {
          providerSourceId: 'yaz-ogretimi.pdf',
          title: 'Yaz Öğretimi Yönergesi',
        },
      ],
    })
    expect(result.answer).toContain('Yaz Öğretimi Yönergesi')
    expect(result.answer).toContain('https://example.edu.tr/yaz-ogretimi.pdf')
  })

  it('expands BİDB and lists matching approved catalog documents', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'BİDB kısaltması hangi birimi ifade eder ve bilişim kaynaklarıyla ilgili hangi yönergeler var?',
      citationSourcesByFilename: {
        'bidb-kaynaklar.pdf': {
          title: 'BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi',
          url: 'https://example.edu.tr/bidb-kaynaklar.pdf',
        },
        'bidb-calisma.pdf': {
          title: 'BİDB Çalışma Usul ve Esasları Hakkındaki Yönerge',
          url: 'https://example.edu.tr/bidb-calisma.pdf',
        },
      },
    })

    expect(result.answer).toContain('Bilgi İşlem Daire Başkanlığı')
    expect(result.answer).toContain('BİDB Bilgisayar, Ağ ve Bilişim Kaynakları Kullanım Yönergesi')
    expect(result.citations).toHaveLength(2)
  })

  it('prefers distinctive document titles over generic overlapping catalog titles', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))
    const citationSourcesByFilename = {
      'erasmus.pdf': {
        title: 'Erasmus + Yönergesi',
        url: 'https://example.edu.tr/erasmus.pdf',
      },
      'degisim.pdf': {
        title: 'Uluslararası İlişkiler ve Değişim Programları Koordinatörlüğü Yönergesi',
        url: 'https://example.edu.tr/degisim.pdf',
      },
      'akademik-danismanlik.pdf': {
        title: 'Akademik Danışmanlık Yönergesi',
        url: 'https://example.edu.tr/akademik-danismanlik.pdf',
      },
      'ogrenci-danisma.pdf': {
        title: 'SKSDB Öğrenci Danışma Merkezi Yönergesi',
        url: 'https://example.edu.tr/ogrenci-danisma.pdf',
      },
      'ozel-ogrenci.pdf': {
        title: 'Özel Öğrenci Yönergesi',
        url: 'https://example.edu.tr/ozel-ogrenci.pdf',
      },
      'ana-yonetmelik.pdf': {
        title: 'YİU Ana Yönetmeliği',
        url: 'https://example.edu.tr/ana-yonetmelik.pdf',
      },
    }

    const erasmus = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Erasmus başvuruları ve değişim programı kuralları hangi dosyada düzenlenmiş?',
      citationSourcesByFilename,
    })
    const academicAdvising = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'Bölüm danışmanımın öğrenciyi yönlendirme sorumlulukları hangi dokümanda anlatılıyor?',
      citationSourcesByFilename,
    })
    const specialStudent = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question:
        'Başka üniversiteden ders almak veya özel öğrenci statüsü için hangi YİÜ dokümanına bakılır?',
      citationSourcesByFilename,
    })

    expect(erasmus.answer).toContain('Erasmus + Yönergesi')
    expect(academicAdvising.answer).toContain('Akademik Danışmanlık Yönergesi')
    expect(specialStudent.answer).toContain('Özel Öğrenci Yönergesi')
  })

  it('lets safe direct catalog facts override a mistaken contextual refusal', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'refuse',
              route: 'safety_refusal',
              domain_relevance: 'in_scope',
              reason: 'mistakenly treated a program fee question as payment collection',
              resolved_user_intent: 'Tıp Fakültesi ücret bilgisi',
              should_retrieve: false,
              safety_class: 'payment',
              answer_policy: 'refuse_payment_collection',
              refusal_answer: 'Ücret bilgisi veremem.',
              confidence: 0.92,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 150, completion_tokens: 38, total_tokens: 188 },
    }))
    const presentationCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Tıp Fakültesi için 2025 ücretli program ücreti 720.000 TL, %50 indirimli ücret 360.000 TL. Burslu kontenjanlarda ücret alınmamaktadır.',
              engagement_question: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 24, total_tokens: 114 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp Fakültesi ücreti ne kadar?',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
      presentationCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(contextualOrchestratorCreateCompletion).toHaveBeenCalledOnce()
    expect(presentationCreateCompletion).toHaveBeenCalledOnce()
    expect(result.refusal).toBe(false)
    expect(result.answer).toContain('720.000 TL')
    expect(result.answer).toContain('360.000 TL')
    expect(result.answer).not.toContain('Ücret bilgisi veremem')
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'refuse',
      contextualRefusalOverriddenByCatalog: true,
      strictVerdict: 'catalog_program_fee_fact',
    })
  })

  it('lets safe direct catalog facts override an unnecessary contextual clarification', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'new_question',
              action: 'clarify',
              route: 'clarify_missing_slots',
              domain_relevance: 'in_scope',
              reason: 'mistakenly asked for a row variant even though the catalog can answer',
              should_retrieve: false,
              missing_slots: ['program_variant'],
              requested_metric: 'price',
              clarification_question: 'Hangi tıp programının fiyatını öğrenmek istiyorsunuz?',
              confidence: 0.86,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 150, completion_tokens: 38, total_tokens: 188 },
    }))
    const presentationCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Tıp Fakültesi için 2025 ücretli program ücreti 720.000 TL, %50 indirimli ücret 360.000 TL. Burslu kontenjanlarda ücret alınmamaktadır.',
              engagement_question: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 24, total_tokens: 114 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'tıp kaç para',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
      presentationCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(contextualOrchestratorCreateCompletion).toHaveBeenCalledOnce()
    expect(presentationCreateCompletion).toHaveBeenCalledOnce()
    expect(result.refusal).toBe(false)
    expect(result.answer).toContain('720.000 TL')
    expect(result.answer).toContain('360.000 TL')
    expect(result.answer).not.toContain('Hangi tıp programının')
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'clarify',
      contextualClarificationOverriddenByCatalog: true,
      strictVerdict: 'catalog_program_fee_fact',
    })
  })

  it('rewrites short referential follow-ups from recent history before strict catalog lookup', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'off_topic',
              action: 'refuse',
              route: 'off_topic_boundary',
              domain_relevance: 'out_of_scope',
              reason: 'misread the short follow-up as a translation request',
              should_retrieve: false,
              answer_policy: 'redirect_to_supported_scope',
              refusal_answer: 'Çeviri konusunda yardımcı olamam.',
              confidence: 0.91,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 170, completion_tokens: 42, total_tokens: 212 },
    }))
    const presentationCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'İngilizce Tıp için 2025 ücretli program ücreti 720.000 TL, %50 indirimli ücret 360.000 TL. Burslu kontenjanlarda ücret alınmamaktadır.',
              engagement_question: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 24, total_tokens: 114 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'ingilizcesi?',
      qualityMode: 'strict',
      contextualOrchestratorMode: 'always',
      contextualOrchestratorCreateCompletion,
      presentationCreateCompletion,
      conversationHistory: [
        { role: 'user', content: 'tıp kaç para' },
        {
          role: 'assistant',
          content:
            "Tıp Fakültesi için 2025 yılı ücretleri, ücretli olarak 720.000 TL, %50 indirimli olarak ise 360.000 TL'dir.",
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(contextualOrchestratorCreateCompletion).toHaveBeenCalledOnce()
    expect(presentationCreateCompletion).toHaveBeenCalledOnce()
    expect(result.refusal).toBe(false)
    expect(result.answer).toContain('720.000 TL')
    expect(result.answer).toContain('360.000 TL')
    expect(result.answer).not.toContain('Çeviri konusunda')
    expect(result.diagnostics).toMatchObject({
      contextualOrchestration: 'rewrite',
      contextualReason: 'referential_followup_history_rewrite',
      contextualTurnType: 'referential_followup',
      contextualRequestedMetric: 'price',
      strictVerdict: 'catalog_program_fee_fact',
    })
  })

  it('strict mode normalizes colloquial program price questions before direct catalog answers', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_sbf',
              filename: 'brochure-02-saglik-bilimleri.md',
              score: 0.95,
              text: [
                '| Puan Kodu | Bölüm Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |',
                '|---|---|---:|---:|---:|---:|---:|',
                '| 207950181 | Dil ve Konuşma Terapisi (Ücretli) | SAY | 2 | 307.129 | 288,301 | 490.000 |',
              ].join('\n'),
            },
          ],
        },
      ],
      usage: { input_tokens: 100, output_tokens: 10, total_tokens: 110 },
    }))
    const createCompletion = vi.fn()
    const presentationCreateCompletion = vi.fn(async (args: Record<string, unknown>) => {
      const messages = args.messages as Array<{ role: string; content: string }>
      const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''
      const userPrompt = messages.find((message) => message.role === 'user')?.content ?? ''

      expect(systemPrompt).toContain('Do not expose internal retrieval or source mechanics')
      expect(systemPrompt).toContain('Daha samimi ve kısa konuş.')
      expect(userPrompt).toContain('2025 broşüründe Ücretli fiyat 490.000 TL')

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer:
                  'Dil ve Konuşma Terapisi için 2025 ücretli program ücreti 490.000 TL, %50 indirimli ücret 245.000 TL.',
                engagement_question: '',
                engagement_evidence: '',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 90, completion_tokens: 24, total_tokens: 114 },
      }
    })

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'dkt kaç tl',
      qualityMode: 'strict',
      createCompletion,
      presentationCreateCompletion,
      settings: {
        bot_name: 'Qualy',
        prompt: 'Daha samimi ve kısa konuş.',
      },
      citationSourcesByFilename: {
        'brochure-02-saglik-bilimleri.md': {
          title: 'YİÜ Tanıtım Broşürü - Sağlık Bilimleri Fakültesi Kontenjan ve Ücretler',
        },
      },
    })

    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(presentationCreateCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toContain('Dil ve Konuşma Terapisi')
    expect(result.answer).toContain('490.000 TL')
    expect(result.answer).toContain('245.000 TL')
    expect(result.answer).not.toContain('broşür')
    expect(result.answer).not.toContain('fiyat alanı')
    expect(result.answer).not.toContain('satır')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      normalizedQuestion: 'Dil ve Konuşma Terapisi ücreti ne kadar?',
      strictVerdict: 'catalog_program_fee_fact',
      presentationPolish: {
        usedPolish: true,
        addedEngagement: false,
        model: 'gpt-4o-mini',
      },
      strictQuality: {
        suggestedScore: 9,
        tier: 'grounded_direct_fact',
      },
      researchPlan: {
        route: 'catalog_direct',
        tools: ['strict_fact_catalog'],
        requiredEvidence: expect.arrayContaining(['direct_catalog_fact']),
      },
    })
  })

  it('strict mode answers catalog-negative existence questions without retrieval', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Hukuk Fakülteniz var mı?',
      qualityMode: 'strict',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('Hukuk Fakültesi')
    expect(result.answer).toContain('listelenmemektedir')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'catalog_unsupported_existence',
      strictQuality: {
        suggestedScore: 8,
        tier: 'safe_actionable_boundary',
      },
    })
  })

  it('strict mode blocks sensitive payment and identity collection without retrieval', async () => {
    const create = vi.fn()

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Kredi kartımı yazsam ödeme alır mısın?',
      qualityMode: 'strict',
    })

    expect(create).not.toHaveBeenCalled()
    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('kredi kartı')
    expect(result.answer).toContain('resmi başvuru ve ödeme kanallarını')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'unsafe_sensitive_data',
      strictQuality: {
        suggestedScore: 9,
        tier: 'grounded_direct_fact',
      },
    })
  })

  it('strict mode can repair a weak final answer with the LLM evaluator', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_life',
              filename: 'kampus-yasami.md',
              score: 0.88,
              text: 'Kampüste sosyal imkanlar ve öğrenci etkinlikleri bulunur.',
            },
          ],
        },
      ],
      usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Kampüs yaşamı belgelerde ayrıntılı şekilde anlatılıyor.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Kampüste sosyal imkanlar ve öğrenci etkinlikleri bulunur.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 70, completion_tokens: 9, total_tokens: 79 },
    }))
    const strictEvaluatorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'repair',
              reason: 'answer_too_broad',
              revised_answer:
                'Belgelerde kampüs yaşamı için sosyal imkanlar ve öğrenci etkinlikleri bilgisi yer almaktadır.',
              confidence: 0.84,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 30, completion_tokens: 4, total_tokens: 34 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Sosyal imkanlarınız var mı?',
      qualityMode: 'strict',
      enableStrictLlmEvaluator: true,
      createCompletion,
      strictEvaluatorCreateCompletion,
      citationSourcesByFilename: {
        'kampus-yasami.md': {
          title: 'YİÜ Kampüs Yaşamı',
          url: 'https://example.edu.tr/kampus',
        },
      },
    })

    expect(create).toHaveBeenCalledOnce()
    expect(createCompletion).toHaveBeenCalledOnce()
    expect(strictEvaluatorCreateCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toContain(
      'Belgelerde kampüs yaşamı için sosyal imkanlar ve öğrenci etkinlikleri bilgisi yer almaktadır.'
    )
    expect(result.answer).toContain('https://example.edu.tr/kampus')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'contextual_no_info',
      strictLlmVerdict: 'repair',
      strictLlmReason: 'answer_too_broad',
    })
    expect(result.usage).toMatchObject({
      inputTokens: 150,
      outputTokens: 18,
      totalTokens: 168,
      toolCalls: 1,
    })
  })

  it('strict mode returns actionable boundaries without spending LLM evaluator tokens when evidence is missing', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))
    const createCompletion = vi.fn()
    const strictEvaluatorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'repair',
              reason: 'needs_clear_boundary',
              revised_answer:
                'Ulaşım servisi genellikle ücretli olabilir, kesin bilgi için üniversiteyi kontrol edin.',
              confidence: 0.8,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 35, completion_tokens: 10, total_tokens: 45 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Servis ücretli mi?',
      qualityMode: 'strict',
      enableStrictLlmEvaluator: true,
      createCompletion,
      strictEvaluatorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(strictEvaluatorCreateCompletion).not.toHaveBeenCalled()
    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('servis ücreti')
    expect(result.answer).toContain('net bilgi bulunmamaktadır')
    expect(result.answer).toContain('Karar için')
    expect(result.answer).not.toContain('genellikle')
    expect(result.answer).not.toContain('olabilir')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'catalog_campus_transport_scope_guard',
    })
  })

  it('strict mode preserves actionable payment-method boundaries without LLM evaluator rewrites', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))
    const createCompletion = vi.fn()
    const strictEvaluatorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'refuse',
              reason: 'unsupported_payment_method',
              confidence: 0.9,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 35, completion_tokens: 6, total_tokens: 41 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Ücreti kriptoyla ödeyebilir miyim?',
      qualityMode: 'strict',
      enableStrictLlmEvaluator: true,
      createCompletion,
      strictEvaluatorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(strictEvaluatorCreateCompletion).not.toHaveBeenCalled()
    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('Kripto para ile ödeme')
    expect(result.answer).toContain('geçerli ödeme yöntemi')
    expect(result.answer).not.toBe('Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'catalog_payment_policy_scope_guard',
    })
  })

  it('strict mode avoids unsupported payment-method additions in actionable no-info boundaries', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
    }))
    const createCompletion = vi.fn()
    const strictEvaluatorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'repair',
              reason: 'needs_clear_boundary',
              revised_answer:
                'Ücreti kriptoyla ödeyip ödeyemeyeceğiniz konusunda net bir bilgi bulunmamaktadır. Mevcut kaynaklar, yalnızca kredi kartı ve banka kartı gibi geleneksel ödeme yöntemlerinin kabul edildiğini belirtmektedir.',
              confidence: 0.82,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 35, completion_tokens: 14, total_tokens: 49 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Ücreti kriptoyla ödeyebilir miyim?',
      qualityMode: 'strict',
      enableStrictLlmEvaluator: true,
      createCompletion,
      strictEvaluatorCreateCompletion,
    })

    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(strictEvaluatorCreateCompletion).not.toHaveBeenCalled()
    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('Kripto para ile ödeme')
    expect(result.answer).not.toContain('kredi kartı')
    expect(result.answer).not.toContain('banka kartı')
    expect(result.answer).not.toContain('geleneksel ödeme')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'catalog_payment_policy_scope_guard',
    })
  })

  it('strict mode records research plan and rejects placeholder raw answers after unsupported generated claims', async () => {
    const create = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_fees',
              filename: 'fees.md',
              score: 0.91,
              text: '2025-2026 eğitim öğretim yılı program ücretleri tabloda listelenmiştir.',
            },
          ],
        },
      ],
      usage: { input_tokens: 50, output_tokens: 5, total_tokens: 55 },
    }))
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Evet, ücretlere KDV dahildir.',
              used_evidence_ids: ['ev_1'],
              support_quotes: [
                '2025-2026 eğitim öğretim yılı program ücretleri tabloda listelenmiştir.',
              ],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 70, completion_tokens: 10, total_tokens: 80 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Ücretlere KDV dahil mi?',
      qualityMode: 'strict',
      createCompletion,
      citationSourcesByFilename: {
        'fees.md': {
          title: 'YİÜ Ücret Bilgileri',
        },
      },
    })

    expect(result.refusal).toBe(true)
    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(result.answer).toContain('KDV dahil olup olmadığı')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'catalog_payment_policy_scope_guard',
      researchPlan: {
        route: 'catalog_direct',
        tools: ['strict_fact_catalog'],
        requiredEvidence: expect.arrayContaining(['direct_catalog_fact']),
      },
    })
  })

  it('strict mode can retry retrieval once when the LLM evaluator finds weak evidence', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [{ type: 'file_search_call', status: 'completed', results: [] }],
        usage: { input_tokens: 20, output_tokens: 5, total_tokens: 25 },
      })
      .mockResolvedValueOnce({
        output_text: 'retrieval complete',
        output: [
          {
            type: 'file_search_call',
            status: 'completed',
            results: [
              {
                file_id: 'file_study',
                filename: 'calisma-alanlari.md',
                score: 0.91,
                text: 'Kütüphanede ders çalışma alanları bulunur.',
              },
            ],
          },
        ],
        usage: { input_tokens: 80, output_tokens: 10, total_tokens: 90 },
      })
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Kütüphanede ders çalışma alanları bulunur.',
              used_evidence_ids: ['ev_1'],
              support_quotes: ['Kütüphanede ders çalışma alanları bulunur.'],
              engagement_question: '',
              engagement_evidence_id: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 15, total_tokens: 105 },
    }))
    const strictEvaluatorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'retry',
              reason: 'wrong_or_weak_evidence',
              retry_query: 'Ders çalışma alanları kütüphane çalışma salonu',
              confidence: 0.36,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 15, completion_tokens: 5, total_tokens: 20 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Sessiz çalışma salonu var mı?',
      qualityMode: 'strict',
      enableStrictLlmEvaluator: true,
      createCompletion,
      strictEvaluatorCreateCompletion,
      citationSourcesByFilename: {
        'calisma-alanlari.md': {
          title: 'YİÜ Çalışma Alanları',
        },
      },
    })

    expect(create).toHaveBeenCalledTimes(2)
    expect(create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        input: 'Ders çalışma alanları kütüphane çalışma salonu',
      })
    )
    expect(createCompletion).toHaveBeenCalledOnce()
    expect(strictEvaluatorCreateCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toContain('Kütüphanede ders çalışma alanları bulunur.')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      strictVerdict: 'supported',
      strictLlmVerdict: 'retry',
      strictLlmReason: 'wrong_or_weak_evidence',
      strictLlmRetryQuery: 'Ders çalışma alanları kütüphane çalışma salonu',
      retryCount: 1,
    })
    expect(result.usage).toMatchObject({
      inputTokens: 205,
      outputTokens: 35,
      totalTokens: 240,
      toolCalls: 2,
    })
  })

  it('preserves the original table metric when a clarification answer supplies only program and variant', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_base_score',
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_tip',
              filename: 'fees.md',
              score: 0.96,
              text:
                '| Puan Kodu | Bölüm Adı | Puan Türü | 2025 Kontenjanı | 2024 Başarı Sırası | 2024 Taban Puanı | 2025 Fiyat |\n| 203510128 | Tıp Fakültesi (İngilizce Ücretli) | SAY | 41 | 767.115 | 309,532 | 720.000 |',
            },
          ],
        },
      ],
      usage: { input_tokens: 80, output_tokens: 7, total_tokens: 87 },
    }))
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'clarification_answer',
              action: 'rewrite',
              reason: 'user_supplied_table_row_scope',
              rewritten_question:
                'Önceki soru: taban puanlar nedir\nKullanıcının netleştirmesi: Tıp İngilizce ücretli',
              original_user_question_used: 'taban puanlar nedir',
              latest_user_clarification_used: 'Tıp İngilizce ücretli',
              should_retrieve: true,
              retrieval_intent: 'base_score',
              confidence: 0.94,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 220, completion_tokens: 54, total_tokens: 274 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp İngilizce ücretli',
      qualityMode: 'strict',
      contextualOrchestratorCreateCompletion,
      conversationHistory: [
        { role: 'user', content: 'taban puanlar nedir' },
        {
          role: 'assistant',
          content:
            'Broşürde taban puanlar program ve burs/indirim satırı bazında listelenir. Hangi programı ve hangi burs/indirim türünü sorduğunuzu belirtmeniz gerekir.',
        },
      ],
    })

    expect(result.answer).toContain('2024 taban puanı 309,532')
    expect(result.answer).not.toContain('2025 fiyatı 720.000 TL')
    expect(result.diagnostics).toMatchObject({
      queryIntent: 'brochure_table_fact',
      contextualTurnType: 'clarification_answer',
      contextualRetrievalIntent: 'base_score',
      contextualRequestedMetric: 'base_score',
    })
  })

  it('keeps the previous internship metric when a clarification answer supplies only the program', async () => {
    const create = vi.fn()
    const contextualOrchestratorCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              turn_type: 'clarification_answer',
              action: 'rewrite',
              reason: 'user_supplied_program_for_internship_duration',
              rewritten_question: 'Önceki soru: staj kaç gün\nKullanıcının netleştirmesi: Anestezi',
              original_user_question_used: 'staj kaç gün',
              latest_user_clarification_used: 'Anestezi',
              should_retrieve: true,
              retrieval_intent: 'internship_duration',
              confidence: 0.93,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 210, completion_tokens: 48, total_tokens: 258 },
    }))

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      vectorStoreId: 'vs_123',
      question: 'Anestezi',
      qualityMode: 'strict',
      contextualOrchestratorCreateCompletion,
      conversationHistory: [
        { role: 'user', content: 'staj kaç gün' },
        {
          role: 'assistant',
          content:
            'Staj süresi programın niteliğine göre değişir. Hangi bölüm veya program için staj bilgisini öğrenmek istiyorsunuz?',
        },
      ],
    })

    expect(create).not.toHaveBeenCalled()
    expect(result.answer).toContain('20 iş gününden az olmamak')
    expect(result.answer).toContain('programın niteliğine göre')
    expect(result.answer).not.toContain('Anestezi Programı kapsamında')
    expect(result.diagnostics).toMatchObject({
      contextualTurnType: 'clarification_answer',
      contextualRetrievalIntent: 'internship_duration',
      strictVerdict: 'catalog_internship_policy_fact',
    })
  })
})
