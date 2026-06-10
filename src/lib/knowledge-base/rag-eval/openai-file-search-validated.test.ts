import { describe, expect, it, vi } from 'vitest'
import { runOpenAiFileSearchValidatedQuestion } from './openai-file-search-validated'

describe('runOpenAiFileSearchValidatedQuestion', () => {
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
      vectorStoreId: 'vs_123',
      question: 'Tıp kaç para?',
      createCompletion,
      citationSourcesByFilename: {
        'brochure-01-tip.md': {
          title: 'YİÜ Tanıtım Broşürü - Tıp Fakültesi Kontenjan ve Ücretler',
          url: 'https://example.edu.tr/brochure.pdf',
        },
      },
    })

    expect(create).toHaveBeenCalledOnce()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(result.refusal).toBe(false)
    expect(result.answer).toContain('Tıp Fakültesi (Ücretli) için 2025 fiyatı 720.000 TL')
    expect(result.answer).toContain('https://example.edu.tr/brochure.pdf')
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

    const result = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'dkt kaç tl',
      qualityMode: 'strict',
      createCompletion,
      citationSourcesByFilename: {
        'brochure-02-saglik-bilimleri.md': {
          title: 'YİÜ Tanıtım Broşürü - Sağlık Bilimleri Fakültesi Kontenjan ve Ücretler',
        },
      },
    })

    expect(create).not.toHaveBeenCalled()
    expect(createCompletion).not.toHaveBeenCalled()
    expect(result.answer).toContain('Dil ve Konuşma Terapisi')
    expect(result.answer).toContain('490.000 TL')
    expect(result.answer).toContain('245.000 TL')
    expect(result.diagnostics).toMatchObject({
      qualityMode: 'strict',
      normalizedQuestion: 'Dil ve Konuşma Terapisi ücreti ne kadar?',
      strictVerdict: 'catalog_program_fee_fact',
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
})
