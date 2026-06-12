import { afterEach, describe, expect, it, vi } from 'vitest'
import { polishGroundedRagAnswer } from '@/lib/knowledge-base/rag-answer-polish'

const chunks = [
  {
    content: [
      'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
      'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.',
    ].join('\n'),
    document_id: 'doc-tlt',
    document_title: 'Tıbbi Laboratuvar Teknikleri Programı',
    source_url: 'https://example.edu.tr/tlt.pdf',
  },
]

describe('polishGroundedRagAnswer', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('adds a source-grounded engagement question selected by the model', async () => {
    const createCompletion = vi.fn(async (args: Record<string, unknown>) => {
      const messages = args.messages as Array<{ role: string; content: string }>
      const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''
      expect(systemPrompt).toContain('Samimi, canlı ve güven veren bir dil kullan.')
      expect(systemPrompt).toContain(
        'organization-specific AI assistant instructions above as the voice and behavior contract'
      )
      expect(systemPrompt).toContain(
        'Try to include exactly one role-neutral engagement question or offer'
      )
      expect(systemPrompt).toContain(
        'Use a conversational, helpful voice instead of sounding like a policy excerpt'
      )
      expect(systemPrompt).toContain(
        'Apply explicit organization tone/personality/style instructions more strongly than the terse original answer'
      )
      expect(systemPrompt).toContain(
        'Do not simply mirror the original extractive wording when a warmer organization voice can preserve the same facts'
      )

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer:
                  'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.',
                engagement_question:
                  'İstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.',
                engagement_evidence:
                  'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      }
    })

    const result = await polishGroundedRagAnswer({
      answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
      userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
      responseLanguage: 'tr',
      chunks,
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(result.answer).toBe(
      'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.'
    )
    expect(result.addedEngagement).toBe(true)
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45, totalTokens: 165 })
  })

  it('drops model engagement when the evidence quote is not present in the retrieved chunks', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer:
                'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.',
              engagement_question: 'İstersen staj ücretinin ne kadar olduğunu da gösterebilirim.',
              engagement_evidence: 'Staj ücreti kurum tarafından ayrıca ilan edilir.',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 40, total_tokens: 140 },
    }))

    const result = await polishGroundedRagAnswer({
      answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
      userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
      responseLanguage: 'tr',
      chunks,
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(result.answer).toBe(
      'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.'
    )
    expect(result.addedEngagement).toBe(false)
  })

  it('drops personal-profile engagement even when the evidence quote is present', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.',
              engagement_question: 'Hangi bölümde eğitim almayı düşünüyorsun?',
              engagement_evidence:
                'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 100, completion_tokens: 36, total_tokens: 136 },
    }))

    const result = await polishGroundedRagAnswer({
      answer: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.',
      userMessage: 'Ders içerikleri hangi sistemlerde paylaşılıyor?',
      responseLanguage: 'tr',
      chunks: [
        {
          content: 'Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.',
          document_id: 'doc-medu',
          document_title: 'Ders İçerikleri',
          source_url: 'https://example.edu.tr/ders-icerikleri.pdf',
        },
      ],
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(result.answer).toBe('Ders içerikleri MEDU Öğrenme Yönetim Sistemi üzerinden paylaşılır.')
    expect(result.addedEngagement).toBe(false)
  })

  it('keeps grounded engagement when the evidence relates to the polished answer even if the user question is terse', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesi’nde yer alıyor.',
              engagement_question:
                'İstersen Bağlıca Yerleşkesi’ne taşınma duyurusunu da kısaca özetleyebilirim.',
              engagement_evidence: 'Sağlık Bilimleri Fakültemiz Bağlıca Yerleşkesine taşındı.',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 110, completion_tokens: 35, total_tokens: 145 },
    }))

    const result = await polishGroundedRagAnswer({
      answer: 'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesi’nde yer alıyor.',
      userMessage: 'SBF kampüsü nerede?',
      responseLanguage: 'tr',
      chunks: [
        {
          content: 'Sağlık Bilimleri Fakültemiz Bağlıca Yerleşkesine taşındı.',
          document_id: 'doc-sbf',
          document_title: 'Sağlık Bilimleri Fakültemiz Bağlıca Yerleşkesine Taşındı',
          source_url: 'https://example.edu.tr/haber/sbf-baglica',
        },
      ],
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(result.answer).toBe(
      'Sağlık Bilimleri Fakültesi Bağlıca Yerleşkesi’nde yer alıyor.\n\nİstersen Bağlıca Yerleşkesi’ne taşınma duyurusunu da kısaca özetleyebilirim.'
    )
    expect(result.addedEngagement).toBe(true)
  })

  it('falls back to the original answer when polish drops critical factual values', async () => {
    const createCompletion = vi.fn(async () => ({
      choices: [
        {
          message: {
            content: JSON.stringify({
              answer: 'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var.',
              engagement_question: '',
              engagement_evidence: '',
            }),
          },
        },
      ],
      usage: { prompt_tokens: 90, completion_tokens: 20, total_tokens: 110 },
    }))

    const result = await polishGroundedRagAnswer({
      answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
      userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
      responseLanguage: 'tr',
      chunks,
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(result.answer).toBe('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.')
    expect(result.usedPolish).toBe(false)
  })

  it('falls back when polish introduces internal source mechanics', async () => {
    const createCompletion = vi.fn(async (args: Record<string, unknown>) => {
      const messages = args.messages as Array<{ role: string; content: string }>
      const systemPrompt = messages.find((message) => message.role === 'system')?.content ?? ''
      expect(systemPrompt).not.toContain('burslu/no-fee')
      expect(systemPrompt).not.toContain('fiyat alanı')

      return {
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer:
                  '2025 yılı için program ücretleri 720.000 TL ve %50 indirimli 360.000 TL. Burslu programlarda fiyat alanı burslu/no-fee olarak gösterilir.',
                engagement_question: '',
                engagement_evidence: '',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 35, total_tokens: 155 },
      }
    })

    const original =
      '2025 yılı için program ücretleri 720.000 TL ve %50 indirimli 360.000 TL. Burslu kontenjanlarda eğitim ücreti alınmaz.'
    const result = await polishGroundedRagAnswer({
      answer: original,
      userMessage: 'tümü, ücretleri de yaz',
      responseLanguage: 'tr',
      chunks: [
        {
          content: original,
          document_id: 'doc-fees',
          document_title: 'Program Ücretleri',
        },
      ],
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(result.answer).toBe(original)
    expect(result.answer).not.toContain('fiyat alanı')
    expect(result.answer).not.toContain('burslu/no-fee')
    expect(result.usedPolish).toBe(false)
  })

  it('retries polish once when the first request fails', async () => {
    const createCompletion = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary request failure'))
      .mockResolvedValueOnce({
        choices: [
          {
            message: {
              content: JSON.stringify({
                answer:
                  'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.',
                engagement_question:
                  'İstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.',
                engagement_evidence:
                  'Staj uygulamasına ilişkin dönem ve başvuru koşulları program dokümanında açıklanır.',
              }),
            },
          },
        ],
        usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165 },
      })

    const result = await polishGroundedRagAnswer({
      answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
      userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
      responseLanguage: 'tr',
      chunks,
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(createCompletion).toHaveBeenCalledTimes(2)
    expect(result.answer).toBe(
      'Evet, Tıbbi Laboratuvar Teknikleri programında yaz stajı var; staj süresi 20 iş günü.\n\nİstersen stajın dönem ve başvuru koşullarını da kısaca çıkarabilirim.'
    )
    expect(result.usedPolish).toBe(true)
    expect(result.addedEngagement).toBe(true)
    expect(result.usage).toEqual({ inputTokens: 120, outputTokens: 45, totalTokens: 165 })
  })

  it('aborts timed-out polish calls before falling back to the original answer', async () => {
    vi.stubEnv('AI_REQUEST_TIMEOUT_MS', '5')
    let aborted = false
    const createCompletion = vi.fn(
      (_args: Record<string, unknown>, options?: { signal?: AbortSignal }) =>
        new Promise<never>((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            aborted = true
            reject(new Error('aborted'))
          })
        })
    )

    const result = await polishGroundedRagAnswer({
      answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
      userMessage: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı var mı?',
      responseLanguage: 'tr',
      chunks,
      settings: {
        prompt: 'Samimi, canlı ve güven veren bir dil kullan.',
        bot_name: 'Qualy',
      },
      createCompletion,
    })

    expect(aborted).toBe(true)
    expect(result.answer).toBe('Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.')
    expect(result.usedPolish).toBe(false)
  })
})
