import { describe, expect, it, vi } from 'vitest'

import { evaluateAnswerWithStrictLlm } from './strict-llm-evaluator'
import { understandStrictQuestion } from './strict-question-understanding'

describe('evaluateAnswerWithStrictLlm', () => {
  it('parses a pass verdict and records usage', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'pass',
              reason: 'answer_supported_by_evidence',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 12, total_tokens: 112 },
    }))

    const result = await evaluateAnswerWithStrictLlm({
      question: 'Tıp Fakültesi var mı?',
      normalizedQuestion: 'Tıp Fakültesi var mı?',
      understanding: understandStrictQuestion('Tıp Fakültesi var mı?'),
      answer: 'Tıp Fakültesi vardır.',
      citations: [
        {
          providerSourceId: 'brochure-07',
          title: 'YİÜ Tanıtım Broşürü - Program ve Yerleşke Eşleşmeleri',
          quote: '### Tıp Fakültesi\n- Tıp Fakültesi (Türkçe)\n- Tıp Fakültesi (İngilizce)',
        },
      ],
      model: 'gpt-4o-mini',
      createCompletion,
    })

    expect(result).toMatchObject({
      verdict: {
        action: 'pass',
        reason: 'answer_supported_by_evidence',
      },
      usage: {
        inputTokens: 100,
        outputTokens: 12,
        totalTokens: 112,
      },
    })
    expect(createCompletion).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
      }),
      expect.anything()
    )
    expect(JSON.stringify(createCompletion.mock.calls[0]?.[0])).toContain('rektör/dekan')
    expect(JSON.stringify(createCompletion.mock.calls[0]?.[0])).toContain('Tıp Fakültesi')
    expect(JSON.stringify(createCompletion.mock.calls[0]?.[0])).toContain('genellikle')
    expect(JSON.stringify(createCompletion.mock.calls[0]?.[0])).toContain('olabilir')
  })

  it('parses repair, clarify, refuse, and retry verdict fields', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              action: 'retry',
              reason: 'wrong_or_weak_evidence',
              retry_query: 'Dil ve Konuşma Terapisi 2025 Fiyat tablo satırı',
              revised_answer: '',
              clarification_question: '',
              confidence: 0.42,
            }),
          },
        },
      ],
    }))

    const result = await evaluateAnswerWithStrictLlm({
      question: 'dkt kaç tl',
      normalizedQuestion: 'Dil ve Konuşma Terapisi ücreti ne kadar?',
      understanding: understandStrictQuestion('dkt kaç tl'),
      answer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      citations: [],
      createCompletion,
    })

    expect(result.verdict).toMatchObject({
      action: 'retry',
      reason: 'wrong_or_weak_evidence',
      retryQuery: 'Dil ve Konuşma Terapisi 2025 Fiyat tablo satırı',
      confidence: 0.42,
    })
  })

  it('returns null when the evaluator response is not valid JSON', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [{ message: { content: 'not json' } }],
    }))

    const result = await evaluateAnswerWithStrictLlm({
      question: 'Kampüs nerede?',
      normalizedQuestion: 'Kampüs nerede?',
      understanding: understandStrictQuestion('Kampüs nerede?'),
      answer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      citations: [],
      createCompletion,
    })

    expect(result).toBeNull()
  })
})
