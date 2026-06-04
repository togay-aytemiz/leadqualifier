import { describe, expect, it, vi } from 'vitest'
import { runOpenAiFileSearchQuestion } from './openai-file-search'

describe('runOpenAiFileSearchQuestion', () => {
  it('calls Responses API with file_search and maps results into provider shape', async () => {
    const create = vi.fn(async () => ({
      id: 'resp_1',
      output_text: 'Cevap metni',
      output: [
        {
          type: 'file_search_call',
          status: 'completed',
          results: [
            {
              file_id: 'file_1',
              filename: 'mazeret.pdf',
              score: 0.91,
              text: 'Mazeret sınavı sağlık raporu ile ilişkilidir.',
              attributes: { story: 'health-report' },
            },
          ],
        },
      ],
      usage: { input_tokens: 120, output_tokens: 45, total_tokens: 165 },
    }))

    const result = await runOpenAiFileSearchQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Sağlık raporu geçerli mi?',
      maxResults: 6,
      instructionProfile: 'qualy',
      citationSourcesByFilename: {
        'mazeret.pdf': {
          title: 'Mazeret Sınavı Yönergesi',
          url: 'https://example.edu.tr/mazeret.pdf',
        },
      },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-4.1-mini',
        input: 'Sağlık raporu geçerli mi?',
        include: ['file_search_call.results'],
        instructions: expect.stringContaining('warm, helpful, concise Qualy assistant voice'),
        tools: [
          expect.objectContaining({
            type: 'file_search',
            vector_store_ids: ['vs_123'],
            max_num_results: 6,
          }),
        ],
      })
    )
    expect(result).toMatchObject({
      provider: 'openai_file_search',
      answer: 'Cevap metni',
      citations: [
        {
          providerSourceId: 'file_1',
          title: 'Mazeret Sınavı Yönergesi',
          url: 'https://example.edu.tr/mazeret.pdf',
          quote: 'Mazeret sınavı sağlık raporu ile ilişkilidir.',
          score: 0.91,
        },
      ],
      refusal: false,
      usage: {
        inputTokens: 120,
        outputTokens: 45,
        totalTokens: 165,
        toolCalls: 1,
        estimatedCredits: 0.1,
      },
    })
    expect(result.timingsMs.total).toBeGreaterThanOrEqual(0)
  })

  it('marks no-clear-information answers as refusals', async () => {
    const create = vi.fn(async () => ({
      output_text: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
      output: [],
      usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 },
    }))

    const result = await runOpenAiFileSearchQuestion({
      client: { responses: { create } },
      model: 'gpt-4.1-mini',
      vectorStoreId: 'vs_123',
      question: 'Desteklenmeyen soru?',
    })

    expect(result.refusal).toBe(true)
    expect(result.usage.toolCalls).toBe(0)
  })

  it('marks safe no-promise answers as refusals for unsupported conversion requests', async () => {
    const create = vi.fn(async () => ({
      output_text: 'Kesin kontenjan ayırma veya kabul garantisi verilemez.',
      output: [],
      usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 },
    }))

    const result = await runOpenAiFileSearchQuestion({
      client: { responses: { create } },
      model: 'gpt-5.4-mini',
      vectorStoreId: 'vs_123',
      question: 'Bana kesin kontenjan ayırır mısınız?',
    })

    expect(result.refusal).toBe(true)
  })

  it('passes source-group metadata filters to File Search', async () => {
    const create = vi.fn(async () => ({
      output_text: 'Tıp Fakültesi hazırlık ücreti 410.000 TL olarak belirtilmiştir.',
      output: [{ type: 'file_search_call', status: 'completed', results: [] }],
      usage: { input_tokens: 20, output_tokens: 8, total_tokens: 28 },
    }))

    await runOpenAiFileSearchQuestion({
      client: { responses: { create } },
      model: 'gpt-5.4-mini',
      vectorStoreId: 'vs_123',
      question: 'Tıp Fakültesi hazırlık ücreti nedir?',
      filters: {
        type: 'in',
        key: 'source_group',
        value: ['brochure-program-fee-tip'],
      },
    })

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
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
  })
})
