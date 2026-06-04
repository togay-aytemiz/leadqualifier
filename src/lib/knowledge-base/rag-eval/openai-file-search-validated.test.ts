import { describe, expect, it, vi } from 'vitest'
import { runOpenAiFileSearchValidatedQuestion } from './openai-file-search-validated'

describe('runOpenAiFileSearchValidatedQuestion', () => {
  it('retrieves File Search results, generates from evidence, and cites selected sources', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'retrieval complete',
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
    const createCompletion = vi.fn()

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
      question:
        'Bugün bilgimi bırakırsam Tıp Fakültesi için bana kesin kontenjan ayırır mısınız?',
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
      question: 'BİDB kısaltması hangi birimi ifade eder ve bilişim kaynaklarıyla ilgili hangi yönergeler var?',
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
      question: 'Bölüm danışmanımın öğrenciyi yönlendirme sorumlulukları hangi dokümanda anlatılıyor?',
      citationSourcesByFilename,
    })
    const specialStudent = await runOpenAiFileSearchValidatedQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Başka üniversiteden ders almak veya özel öğrenci statüsü için hangi YİÜ dokümanına bakılır?',
      citationSourcesByFilename,
    })

    expect(erasmus.answer).toContain('Erasmus + Yönergesi')
    expect(academicAdvising.answer).toContain('Akademik Danışmanlık Yönergesi')
    expect(specialStudent.answer).toContain('Özel Öğrenci Yönergesi')
  })
})
