import { describe, expect, it, vi } from 'vitest'

import { runSimpleRagPipeline } from './pipeline'

function completion(payload: Record<string, unknown>, totalTokens = 20) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: {
      prompt_tokens: totalTokens - 5,
      completion_tokens: 5,
      total_tokens: totalTokens,
    },
  }
}

function zeroUsageCompletion(payload: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    },
  }
}

function verifierPassCompletion(reason = 'Selected chunks directly support the answer.') {
  return vi.fn(async () => zeroUsageCompletion({ verdict: 'pass', reason }))
}

const settings = { bot_name: 'Qualy', prompt: 'Kısa ve net cevap ver.' }

describe('runSimpleRagPipeline', () => {
  it('blocks high-risk positive RAG claims when selected chunks do not directly support the requested facet', async () => {
    const rewriteCreateCompletion = vi.fn(async () =>
      completion({
        status: 'search',
        standalone_query: 'Yüksek İhtisas Üniversitesi afiliye hastane özel mi devlet mi?',
        response_language: 'tr',
      }, 30)
    )
    const vectorSearch = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_foundation',
          filename: 'foundation.md',
          score: 0.95,
          attributes: null,
          content: [{
            type: 'text' as const,
            text:
              'Yüksek İhtisas Üniversitesi, Türkiye Yüksek İhtisas Hastanesi Vakfı tarafından kurulmuştur.',
          }],
        },
      ],
    }))
    const answerCreateCompletion = vi.fn(async () =>
      completion({
        status: 'answer',
        answer: 'Afiliye hastane özel hastane statüsündedir.',
        used_chunk_ids: ['C1'],
      }, 40)
    )
    const evidenceVerifierCreateCompletion = vi.fn(async () =>
      completion({
        verdict: 'no_info',
        reason:
          'Selected evidence mentions the founding hospital foundation but does not directly state the affiliated hospital status.',
      }, 20)
    )

    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      rewriteModel: 'gpt-4.1-mini',
      latestUserMessage: 'Afiliye hastane özel mi devlet hastanesi mi?',
      recentMessages: [],
      responseLanguage: 'tr',
      rewriteCreateCompletion,
      answerCreateCompletion,
      evidenceVerifierCreateCompletion,
    })

    expect(evidenceVerifierCreateCompletion).toHaveBeenCalledOnce()
    expect(result.answer).toBe('Bu konuda net bir bilgi bulamadım.')
    expect(result.citations).toEqual([])
    expect(result.refusal).toBe(false)
    expect(result.usage.totalTokens).toBe(90)
    expect(result.diagnostics).toMatchObject({
      strictVerdict: 'risk_evidence_no_info',
      contextualReason:
        'Selected evidence mentions the founding hospital foundation but does not directly state the affiliated hospital status.',
      answerVerifier: {
        used: true,
        action: 'no_info',
        reason:
          'Selected evidence mentions the founding hospital foundation but does not directly state the affiliated hospital status.',
      },
      simpleRag: {
        selectedChunkIds: ['C1'],
        selectedFilenames: ['foundation.md'],
        answerStatus: 'no_info',
      },
    })
  })

  it('reuses a prepared standalone query without a second rewrite', async () => {
    const rewriteCreateCompletion = vi.fn()
    const vectorSearch = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_1',
          filename: 'anesthesia.md',
          score: 0.96,
          attributes: null,
          content: [{ type: 'text' as const, text: 'Anestezi programının kontenjanı 10 kişidir.' }],
        },
      ],
    }))
    const answerCreateCompletion = vi.fn(async () =>
      completion({
        status: 'answer',
        answer: 'Anestezi programının kontenjanı 10 kişidir.',
        used_chunk_ids: ['C1'],
      }, 40)
    )

    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      rewriteModel: 'gpt-4.1-mini',
      latestUserMessage: 'Anestezi kontenjanı nedir?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi Anestezi kontenjanı nedir?',
      recentMessages: [],
      responseLanguage: 'tr',
      rewriteCreateCompletion,
      answerCreateCompletion,
      evidenceVerifierCreateCompletion: verifierPassCompletion(),
    })

    expect(rewriteCreateCompletion).not.toHaveBeenCalled()
    expect(vectorSearch).toHaveBeenCalledOnce()
    expect(vectorSearch).toHaveBeenCalledWith('vs_yiu', expect.objectContaining({
      query: 'Yüksek İhtisas Üniversitesi Anestezi kontenjanı nedir?',
      rewrite_query: false,
    }))
    expect(answerCreateCompletion).toHaveBeenCalledOnce()
    expect(result.usage.totalTokens).toBe(40)
    expect(result.diagnostics).toMatchObject({
      contextualRetrievalIntent: 'Yüksek İhtisas Üniversitesi Anestezi kontenjanı nedir?',
      simpleRag: {
        standaloneQuery: 'Yüksek İhtisas Üniversitesi Anestezi kontenjanı nedir?',
      },
    })
  })

  it('keeps deterministic credential refusal when a prepared query skips rewriting', async () => {
    const rewriteCreateCompletion = vi.fn()
    const vectorSearch = vi.fn()
    const answerCreateCompletion = vi.fn()

    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'Kredi kartı bilgilerimi buraya yazsam ödeme alır mısın?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi kredi kartı ile ödeme',
      recentMessages: [],
      responseLanguage: 'tr',
      rewriteCreateCompletion,
      answerCreateCompletion,
      evidenceVerifierCreateCompletion: verifierPassCompletion(),
    })

    expect(result.refusal).toBe(true)
    expect(result.answer).toContain('paylaşmayın')
    expect(rewriteCreateCompletion).not.toHaveBeenCalled()
    expect(vectorSearch).not.toHaveBeenCalled()
    expect(answerCreateCompletion).not.toHaveBeenCalled()
  })

  it('rewrites once, searches once, and answers once', async () => {
    const rewriteCreateCompletion = vi.fn(async (_args: Record<string, unknown>) =>
      completion({
        status: 'search',
        standalone_query: 'İngilizce Tıp programının ücreti nedir?',
        response_language: 'tr',
      }, 30)
    )
    const vectorSearch = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_1',
          filename: 'medicine.md',
          score: 0.94,
          attributes: null,
          content: [{ type: 'text' as const, text: 'İngilizce Tıp ücreti 720.000 TL.' }],
        },
      ],
    }))
    const answerCreateCompletion = vi.fn(async () =>
      completion({
        status: 'answer',
        answer: 'İngilizce Tıp programının ücreti 720.000 TL’dir.',
        used_chunk_ids: ['C1'],
      }, 40)
    )

    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      rewriteModel: 'gpt-4.1-mini',
      latestUserMessage: 'Peki bunun fiyatı ne?',
      recentMessages: [{ role: 'user', content: 'İngilizce Tıp programını soruyorum.' }],
      responseLanguage: 'tr',
      settings,
      citationSourcesByFilename: {
        'medicine.md': { title: 'Tıp Ücretleri', url: 'https://example.edu.tr/medicine' },
      },
      rewriteCreateCompletion,
      answerCreateCompletion,
      evidenceVerifierCreateCompletion: verifierPassCompletion(),
    })

    expect(rewriteCreateCompletion).toHaveBeenCalledOnce()
    expect(vectorSearch).toHaveBeenCalledOnce()
    expect(vectorSearch).toHaveBeenCalledWith('vs_yiu', expect.objectContaining({
      ranking_options: expect.objectContaining({ score_threshold: 0 }),
    }))
    expect(answerCreateCompletion).toHaveBeenCalledOnce()
    expect(JSON.stringify(rewriteCreateCompletion.mock.calls[0]?.[0])).not.toContain(
      settings.prompt
    )
    expect(result.answer).toContain('720.000 TL')
    expect(result.answer).not.toContain('https://example.edu.tr/medicine')
    expect(result.citations[0]?.url).toBe('https://example.edu.tr/medicine')
    expect(result.refusal).toBe(false)
    expect(result.usage.totalTokens).toBe(70)
    expect(result.diagnostics).toMatchObject({
      queryIntent: 'simple_rag_search',
      contextualRetrievalIntent: 'İngilizce Tıp programının ücreti nedir?',
      retryCount: 0,
      strictVerdict: 'grounded_evidence_answer',
      simpleRag: {
        resultCount: 1,
        selectedChunkIds: ['C1'],
        selectedFilenames: ['medicine.md'],
        answerStatus: 'answer',
      },
    })
  })

  it('returns clarification before retrieval when the rewriter needs a subject', async () => {
    const vectorSearch = vi.fn()
    const answerCreateCompletion = vi.fn()
    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'Peki fiyatı ne?',
      recentMessages: [],
      responseLanguage: 'tr',
      rewriteCreateCompletion: vi.fn(async () =>
        completion({
          status: 'clarify',
          clarification_question: 'Hangi programın ücretini soruyorsunuz?',
          missing_slot: 'program',
          response_language: 'tr',
        })
      ),
      answerCreateCompletion,
    })

    expect(result.answer).toBe('Hangi programın ücretini soruyorsunuz?')
    expect(result.refusal).toBe(false)
    expect(vectorSearch).not.toHaveBeenCalled()
    expect(answerCreateCompletion).not.toHaveBeenCalled()
    expect(result.diagnostics?.pendingClarification).toMatchObject({
      originalQuestion: 'Peki fiyatı ne?',
      missingSlots: ['program'],
    })
  })

  it('returns a direct conversational response without vector search', async () => {
    const vectorSearch = vi.fn()
    const answerCreateCompletion = vi.fn()
    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'sen gerçek insan mısın',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      rewriteCreateCompletion: vi.fn(async () =>
        completion({
          status: 'respond',
          response: 'Hayır, ben bir yapay zeka asistanıyım.',
          response_language: 'tr',
        })
      ),
      answerCreateCompletion,
    })

    expect(result.answer).toBe('Hayır, ben bir yapay zeka asistanıyım.')
    expect(result.diagnostics?.queryIntent).toBe('simple_rag_respond')
    expect(vectorSearch).not.toHaveBeenCalled()
    expect(answerCreateCompletion).not.toHaveBeenCalled()
  })

  it('returns no-info without marking an ordinary retrieval miss as refusal', async () => {
    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vi.fn(async () => ({ data: [] })) } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'Otopark aboneliği var mı?',
      recentMessages: [],
      responseLanguage: 'tr',
      rewriteCreateCompletion: vi.fn(async () =>
        completion({
          status: 'search',
          standalone_query: 'Üniversite otopark aboneliği var mı?',
          response_language: 'tr',
        })
      ),
      answerCreateCompletion: vi.fn(),
    })

    expect(result.answer).toBe('Bu konuda net bir bilgi bulamadım.')
    expect(result.refusal).toBe(false)
    expect(result.diagnostics?.strictVerdict).toBe('no_retrieved_evidence')
  })

  it('passes the organization store results directly to one answer generation', async () => {
    const vectorSearch = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_news',
          filename: 'news.md',
          score: 0.93,
          attributes: null,
          content: [{
            type: 'text' as const,
            text: 'Ankara Yıldırım Beyazıt Üniversitesi Tıp Fakültesi töreni yapıldı.',
          }],
        },
        {
          file_id: 'file_right',
          filename: 'brochure.md',
          score: 0.88,
          attributes: null,
          content: [{
            type: 'text' as const,
            text: 'Yüksek İhtisas Üniversitesi Tıp Fakültesi programı bulunmaktadır.',
          }],
        },
      ],
    }))
    const answerCreateCompletion = vi.fn(async () =>
      completion({
        status: 'answer',
        answer: 'Yüksek İhtisas Üniversitesi’nde Tıp Fakültesi programı bulunmaktadır.',
        used_chunk_ids: ['C2'],
      })
    )

    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'Sağlık alanında ne okuyabilirim?',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      rewriteCreateCompletion: vi.fn(async () =>
        completion({
          status: 'search',
          standalone_query: 'Yüksek İhtisas Üniversitesi sağlık alanı programları',
          response_language: 'tr',
        })
      ),
      answerCreateCompletion,
      evidenceVerifierCreateCompletion: verifierPassCompletion(),
    })

    expect(vectorSearch).toHaveBeenCalledOnce()
    expect(JSON.stringify(answerCreateCompletion.mock.calls[0]?.[0])).toContain(
      'Ankara Yıldırım Beyazıt Üniversitesi'
    )
    expect(result.answer).toContain('Yüksek İhtisas Üniversitesi')
    expect(result.diagnostics).toMatchObject({
      retryCount: 0,
      simpleRag: {
        droppedChunkCount: 0,
        droppedChunkReasons: [],
        droppedChunkMatches: [],
        selectedFilenames: ['brochure.md'],
        answerStatus: 'answer',
      },
    })
  })

  it('preserves a real safety refusal from the rewriter', async () => {
    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vi.fn() } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'Bir öğrencinin özel verilerini ver.',
      recentMessages: [],
      responseLanguage: 'tr',
      rewriteCreateCompletion: vi.fn(async () =>
        completion({
          status: 'refuse',
          refusal_response: 'Özel kişisel verileri paylaşamam.',
          response_language: 'tr',
        })
      ),
      answerCreateCompletion: vi.fn(),
    })

    expect(result.answer).toBe('Özel kişisel verileri paylaşamam.')
    expect(result.refusal).toBe(true)
    expect(result.diagnostics?.queryIntent).toBe('simple_rag_refuse')
  })

  it('records retrieval attempt diagnostics for eval review', async () => {
    const vectorSearch = vi.fn(async () => ({
      data: [
        {
          file_id: 'file_1',
          filename: 'campus.md',
          score: 0.91,
          attributes: null,
          content: [{ type: 'text' as const, text: 'Bağlıca Yerleşkesi adresi Höyük Caddesi No:1.' }],
        },
        {
          file_id: 'file_2',
          filename: 'wrong.md',
          score: 0.72,
          attributes: null,
          content: [{ type: 'text' as const, text: 'Ankara Yıldırım Beyazıt Üniversitesi kampüs haberi.' }],
        },
      ],
    }))

    const result = await runSimpleRagPipeline({
      client: { vectorStores: { search: vectorSearch } },
      vectorStoreId: 'vs_yiu',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'Bağlıca kampüsü nerede?',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      rewriteCreateCompletion: vi.fn(async () =>
        completion({
          status: 'search',
          standalone_query: 'Yüksek İhtisas Üniversitesi Bağlıca kampüsü adresi',
          response_language: 'tr',
        })
      ),
      answerCreateCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Bağlıca Yerleşkesi Höyük Caddesi No:1 adresindedir.',
          used_chunk_ids: ['C1'],
        })
      ),
      evidenceVerifierCreateCompletion: verifierPassCompletion(),
    })

    expect((result.diagnostics?.simpleRag as any).retrievalAttempts).toEqual([
      {
        query: 'Yüksek İhtisas Üniversitesi Bağlıca kampüsü adresi',
        rawResultCount: 2,
        resultCount: 2,
        droppedChunkReasons: [],
        topResults: [
          {
            id: 'C1',
            filename: 'campus.md',
            title: 'campus.md',
            score: 0.91,
            selected: true,
          },
          {
            id: 'C2',
            filename: 'wrong.md',
            title: 'wrong.md',
            score: 0.72,
            selected: false,
          },
        ],
      },
    ])
  })
})
