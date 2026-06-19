import { describe, expect, it, vi } from 'vitest'

import { generateSimpleRagAnswer } from './answer-generator'

const chunks = [
  {
    id: 'C1',
    fileId: 'file_1',
    filename: 'medicine.md',
    title: 'Tıp Programı',
    url: 'https://example.edu.tr/medicine',
    score: 0.94,
    content: 'Tıp Fakültesi eğitim süresi hazırlık sınıfı hariç 6 yıldır.',
  },
]

function completion(payload: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 90, completion_tokens: 20, total_tokens: 110 },
  }
}

describe('generateSimpleRagAnswer', () => {
  it('answers once from selected chunks and receives history only for continuity', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'answer',
        answer: 'Tıp Fakültesi eğitimi hazırlık sınıfı hariç 6 yıldır.',
        used_chunk_ids: ['C1'],
      })
    )

    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Peki kaç yıl?',
      standaloneQuery: 'Tıp Fakültesi eğitim süresi kaç yıldır?',
      recentMessages: [{ role: 'user', content: 'Tıp Fakültesini soruyorum.' }],
      responseLanguage: 'tr',
      chunks,
      createCompletion,
    })

    expect(result).toMatchObject({
      status: 'answer',
      answer: 'Tıp Fakültesi eğitimi hazırlık sınıfı hariç 6 yıldır.',
      usedChunkIds: ['C1'],
      selectedChunks: chunks,
    })
    const request = createCompletion.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(request.messages[0]?.content).toContain(
      'The retrieved chunks are the only factual authority'
    )
    expect(request.messages[0]?.content).toContain(
      'Do not mention sources, files, chunks, retrieval'
    )
    expect(request.messages[1]?.content).toContain('Peki kaç yıl?')
    expect(request.messages[1]?.content).toContain('Tıp Fakültesini soruyorum.')
    expect(request.messages[1]?.content).toContain('[C1] Tıp Programı')
  })

  it('rejects an invented protected numeric value', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Kaç yıl?',
      standaloneQuery: 'Tıp Fakültesi eğitim süresi kaç yıldır?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks,
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Tıp Fakültesi eğitimi 4 yıldır.',
          used_chunk_ids: ['C1'],
        })
      ),
    })

    expect(result).toMatchObject({ status: 'no_info', reason: 'unsupported_protected_value' })
  })

  it('rejects unknown chunk ids', async () => {
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Kaç yıl?',
      standaloneQuery: 'Tıp Fakültesi eğitim süresi kaç yıldır?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks,
      createCompletion: vi.fn(async () =>
        completion({
          status: 'answer',
          answer: 'Tıp Fakültesi eğitimi 6 yıldır.',
          used_chunk_ids: ['C99'],
        })
      ),
    })

    expect(result).toMatchObject({ status: 'no_info', reason: 'invalid_chunk_ids' })
  })

  it('keeps a model no-info result without another judge pass', async () => {
    const createCompletion = vi.fn(async () => completion({ status: 'no_info' }))
    const result = await generateSimpleRagAnswer({
      latestUserMessage: 'Otopark aboneliği var mı?',
      standaloneQuery: 'Üniversite otopark aboneliği var mı?',
      recentMessages: [],
      responseLanguage: 'tr',
      chunks,
      createCompletion,
    })

    expect(createCompletion).toHaveBeenCalledOnce()
    expect(result).toMatchObject({ status: 'no_info', reason: 'model_no_info' })
  })
})
