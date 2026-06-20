import { describe, expect, it, vi } from 'vitest'

import { runOneStepFileSearch } from './one-step-file-search'

function response(overrides: Record<string, unknown> = {}) {
  return {
    output_text: JSON.stringify({ status: 'answer', answer: 'Doğrudan desteklenen cevap.' }),
    output: [
      {
        id: 'fs_1',
        type: 'file_search_call',
        status: 'completed',
        queries: ['YİÜ kampüs adresi'],
        results: [
          {
            file_id: 'file_1',
            filename: 'campus.md',
            score: 0.91,
            text: 'Bağlıca Yerleşkesi Ankara adresindedir.',
          },
        ],
      },
    ],
    usage: { input_tokens: 100, output_tokens: 20, total_tokens: 120 },
    ...overrides,
  }
}

describe('runOneStepFileSearch', () => {
  it('forces one GPT-5.5 Responses File Search call with strict output', async () => {
    const create = vi.fn(async () => response())

    const result = await runOneStepFileSearch({
      client: { responses: { create } },
      model: 'gpt-5.5',
      vectorStoreId: 'vs_yiu',
      latestUserMessage: 'kampüs nerede?',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi kampüs adresi',
      responseLanguage: 'tr',
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      assistantInstructionContext: 'Kısa ve sıcak konuş.',
      dictionaryContext: 'YİÜ => Yüksek İhtisas Üniversitesi',
      recentMessages: [{ role: 'user', content: 'Bağlıca kampüsünü soruyorum.' }],
      maxResults: 12,
      citationSourcesByFilename: {
        'campus.md': { title: 'Yerleşkeler', url: 'https://example.edu.tr/campus' },
      },
    })

    expect(create).toHaveBeenCalledWith(expect.objectContaining({
      model: 'gpt-5.5',
      include: ['file_search_call.results'],
      tool_choice: { type: 'file_search' },
      reasoning: { effort: 'medium' },
      store: false,
      max_output_tokens: 2000,
      tools: [{
        type: 'file_search',
        vector_store_ids: ['vs_yiu'],
        max_num_results: 12,
      }],
      text: {
        verbosity: 'low',
        format: expect.objectContaining({
          type: 'json_schema',
          name: 'qualy_file_search_answer',
          strict: true,
        }),
      },
      instructions: expect.stringMatching(/exact requested subject and facet[\s\S]*regulation or definition[\s\S]*not interchangeable/i),
      input: expect.stringContaining('Yüksek İhtisas Üniversitesi kampüs adresi'),
    }))
    expect(result).toMatchObject({
      provider: 'openai_file_search',
      status: 'answer',
      answer: 'Doğrudan desteklenen cevap.',
      citations: [{
        providerSourceId: 'file_1',
        title: 'Yerleşkeler',
        url: 'https://example.edu.tr/campus',
        quote: 'Bağlıca Yerleşkesi Ankara adresindedir.',
        score: 0.91,
      }],
      usage: {
        inputTokens: 100,
        outputTokens: 20,
        totalTokens: 120,
        toolCalls: 1,
      },
      diagnostics: {
        queries: ['YİÜ kampüs adresi'],
        resultCount: 1,
        topScores: [0.91],
      },
    })
  })

  it('returns a distinct no_info status without inventing customer copy', async () => {
    const create = vi.fn(async () => response({
      output_text: JSON.stringify({ status: 'no_info', answer: '' }),
      output: [{
        id: 'fs_1',
        type: 'file_search_call',
        status: 'completed',
        queries: ['Psikoloji bölümü'],
        results: [],
      }],
    }))

    const result = await runOneStepFileSearch({
      client: { responses: { create } },
      model: 'gpt-5.5',
      vectorStoreId: 'vs_yiu',
      latestUserMessage: 'Psikoloji bölümü var mı?',
      responseLanguage: 'tr',
    })

    expect(result).toMatchObject({ status: 'no_info', answer: '', refusal: false })
  })

  it('preserves a concise safety refusal', async () => {
    const create = vi.fn(async () => response({
      output_text: JSON.stringify({
        status: 'refuse',
        answer: 'Şifrenizi paylaşmayın; bu işlemi sizin adınıza yapamam.',
      }),
    }))

    const result = await runOneStepFileSearch({
      client: { responses: { create } },
      model: 'gpt-5.5',
      vectorStoreId: 'vs_yiu',
      latestUserMessage: 'ÖSYM şifremi vereyim, tercihimi yap.',
      responseLanguage: 'tr',
    })

    expect(result).toMatchObject({
      status: 'refuse',
      refusal: true,
      answer: 'Şifrenizi paylaşmayın; bu işlemi sizin adınıza yapamam.',
    })
  })

  it('rejects malformed output instead of converting it to no_info', async () => {
    const create = vi.fn(async () => response({ output_text: 'not-json' }))

    await expect(runOneStepFileSearch({
      client: { responses: { create } },
      model: 'gpt-5.5',
      vectorStoreId: 'vs_yiu',
      latestUserMessage: 'Kampüs nerede?',
      responseLanguage: 'tr',
    })).rejects.toThrow('Invalid one-step File Search output')
  })
})
