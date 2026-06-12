import { describe, expect, it, vi } from 'vitest'

import { runLlmFirstFileSearchPipeline } from './pipeline'

const settings = {
  bot_name: 'Qualy',
  prompt: 'Aday öğrencilere sıcak ve kısa cevap ver.',
}

describe('runLlmFirstFileSearchPipeline', () => {
  it('searches and answers a basic campus-location question from returned evidence', async () => {
    const responsesCreate = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_campus',
              filename: 'campus.md',
              score: 0.97,
              text: 'Bağlıca Yerleşkesi: Kızılcaşar Mahallesi 23 Nisan Caddesi No: 17, Etimesgut/Ankara.',
            },
          ],
        },
      ],
      usage: { input_tokens: 80, output_tokens: 8, total_tokens: 88 },
    }))
    const plannerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: 'search',
              resolved_question: 'Üniversitenin kampüsü nerede?',
              search_query: 'üniversite kampüs yerleşke açık adres',
              answer_goal: 'Doğrulanmış kampüs adresini söyle.',
              response_language: 'tr',
              required_facts: ['kampüs adresi'],
              forbidden_assumptions: [],
              confidence: 0.98,
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 30, total_tokens: 130 },
    }))
    const answerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Bağlıca Yerleşkesi, Kızılcaşar Mahallesi 23 Nisan Caddesi No: 17, Etimesgut/Ankara adresindedir.',
              support_quotes: [
                'Bağlıca Yerleşkesi: Kızılcaşar Mahallesi 23 Nisan Caddesi No: 17, Etimesgut/Ankara.',
              ],
              used_evidence_ids: ['E1'],
              engagement_question: '',
              engagement_evidence: '',
              engagement_evidence_id: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 120, completion_tokens: 35, total_tokens: 155 },
    }))
    const polishCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Bağlıca Yerleşkesi Kızılcaşar Mahallesi, 23 Nisan Caddesi No: 17, Etimesgut/Ankara adresinde.',
              engagement_question: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 70, completion_tokens: 24, total_tokens: 94 },
    }))

    const result = await runLlmFirstFileSearchPipeline({
      client: { responses: { create: responsesCreate } },
      vectorStoreId: 'vs_yiu',
      retrievalModel: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'kampüs nerede acaba',
      recentMessages: [],
      responseLanguage: 'tr',
      settings,
      citationSourcesByFilename: {
        'campus.md': { title: 'Yerleşkeler', url: 'https://example.edu.tr/campus' },
      },
      plannerCreateCompletion,
      answerCreateCompletion,
      polishCreateCompletion,
    })

    expect(responsesCreate).toHaveBeenCalledOnce()
    expect(result.answer).toContain('Etimesgut/Ankara')
    expect(result.answer).not.toMatch(/net bir bilgi veremiyorum/i)
    expect(result.citations).toEqual([
      expect.objectContaining({
        providerSourceId: 'file_campus',
        url: 'https://example.edu.tr/campus',
      }),
    ])
    expect(result.diagnostics).toMatchObject({
      queryIntent: 'llm_first_search',
      contextualQuestion: 'Üniversitenin kampüsü nerede?',
    })
  })

  it('returns the planner clarification without calling File Search', async () => {
    const responsesCreate = vi.fn()
    const plannerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: 'clarify',
              clarification_question: 'Hangi programın başarı sırasını öğrenmek istiyorsunuz?',
              missing_information: ['program'],
              response_language: 'tr',
              confidence: 0.91,
            }),
          },
        },
      ],
    }))

    const result = await runLlmFirstFileSearchPipeline({
      client: { responses: { create: responsesCreate } },
      vectorStoreId: 'vs_yiu',
      retrievalModel: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'sıralaması nedir',
      recentMessages: [],
      responseLanguage: 'tr',
      settings,
      plannerCreateCompletion,
    })

    expect(responsesCreate).not.toHaveBeenCalled()
    expect(result.answer).toBe('Hangi programın başarı sırasını öğrenmek istiyorsunuz?')
    expect(result.diagnostics?.pendingClarification).toMatchObject({
      missingSlots: ['program'],
    })
  })

  it('rejects polish that mutates a protected numeric fact', async () => {
    const responsesCreate = vi.fn(async () => ({
      output_text: 'retrieval complete',
      output: [
        {
          type: 'file_search_call',
          results: [
            {
              file_id: 'file_rank',
              filename: 'rank.md',
              score: 0.95,
              text: 'Tıp Fakültesi (Türkçe) 2024 başarı sırası 22.450 olarak listelenmiştir.',
            },
          ],
        },
      ],
    }))
    const plannerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              decision: 'search',
              resolved_question: 'Tıp Türkçe programının 2024 başarı sırası nedir?',
              search_query: 'Tıp Türkçe 2024 başarı sırası',
              answer_goal: 'Başarı sırasını söyle.',
              response_language: 'tr',
              required_facts: ['2024 başarı sırası'],
              forbidden_assumptions: [],
              confidence: 0.99,
            }),
          },
        },
      ],
    }))
    const answerCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Tıp Fakültesi (Türkçe) için 2024 başarı sırası 22.450.',
              support_quotes: [
                'Tıp Fakültesi (Türkçe) 2024 başarı sırası 22.450 olarak listelenmiştir.',
              ],
              used_evidence_ids: ['E1'],
              engagement_question: '',
              engagement_evidence: '',
              engagement_evidence_id: '',
            }),
          },
        },
      ],
    }))
    const polishCreateCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Tıp Fakültesi (Türkçe) için başarı sırası 12.000.',
              engagement_question: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
    }))

    const result = await runLlmFirstFileSearchPipeline({
      client: { responses: { create: responsesCreate } },
      vectorStoreId: 'vs_yiu',
      retrievalModel: 'gpt-4.1-mini',
      answerModel: 'gpt-4o-mini',
      latestUserMessage: 'tıp tr sıralaması',
      recentMessages: [],
      responseLanguage: 'tr',
      settings,
      plannerCreateCompletion,
      answerCreateCompletion,
      polishCreateCompletion,
    })

    expect(result.answer).toContain('22.450')
    expect(result.answer).not.toContain('12.000')
    expect(result.diagnostics?.presentationPolish).toMatchObject({ usedPolish: false })
  })
})
