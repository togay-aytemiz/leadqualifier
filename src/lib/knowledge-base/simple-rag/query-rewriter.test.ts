import { describe, expect, it, vi } from 'vitest'

import { rewriteSimpleRagQuery } from './query-rewriter'

function completion(payload: Record<string, unknown>) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 40, completion_tokens: 12, total_tokens: 52 },
  }
}

describe('rewriteSimpleRagQuery', () => {
  it('uses history only to resolve the latest referential question', async () => {
    const createCompletion = vi.fn(async (_args: Record<string, unknown>) =>
      completion({
        status: 'search',
        standalone_query: 'İngilizce Tıp programının ücreti nedir?',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'Peki bunun fiyatı ne?',
      recentMessages: [
        { role: 'user', content: 'İngilizce Tıp programını soruyorum' },
        { role: 'assistant', content: 'İngilizce Tıp hakkında yardımcı olabilirim.' },
      ],
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'search',
      standaloneQuery: 'İngilizce Tıp programının ücreti nedir?',
      responseLanguage: 'tr',
    })
    expect(result.usage).toEqual({ inputTokens: 40, outputTokens: 12, totalTokens: 52 })

    const request = createCompletion.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(request.messages[0]?.content).toContain('Do not answer the question')
    expect(request.messages[1]?.content).toContain('Peki bunun fiyatı ne?')
    expect(request.messages[1]?.content).toContain('İngilizce Tıp programını soruyorum')
  })

  it('returns one specific clarification when the subject cannot be resolved', async () => {
    const createCompletion = vi.fn(async (_args: Record<string, unknown>) =>
      completion({
        status: 'clarify',
        clarification_question: 'Hangi programın ücretini soruyorsunuz?',
        missing_slot: 'program',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'Peki fiyatı ne?',
      recentMessages: [],
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'clarify',
      clarificationQuestion: 'Hangi programın ücretini soruyorsunuz?',
      missingSlot: 'program',
      responseLanguage: 'tr',
    })
  })

  it('passes the known organization scope so a concrete demo question does not re-ask the institution', async () => {
    const createCompletion = vi.fn(async (_args: Record<string, unknown>) =>
      completion({
        status: 'search',
        standalone_query: 'Yüksek İhtisas Üniversitesi kampüsleri nerede?',
        response_language: 'tr',
      })
    )

    await rewriteSimpleRagQuery({
      latestUserMessage: 'kampüsler nerede',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      assistantInstructionContext:
        'Assistant task/scope instructions: Yüksek İhtisas Üniversitesi Tanıtım Günleri aday öğrenci asistanı gibi konuş.',
      responseLanguage: 'tr',
      createCompletion,
    })

    const request = createCompletion.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(request.messages[0]?.content).toContain(
      'Never ask which institution when organization context is provided'
    )
    expect(request.messages[0]?.content).toContain(
      'Use them only to identify the active organization'
    )
    expect(request.messages[0]?.content).toContain(
      'Do not copy long assistant instructions into the standalone query'
    )
    expect(request.messages[0]?.content).toContain(
      'Optimize search queries with concise terms implied by the requested facet'
    )
    expect(request.messages[0]?.content).toContain(
      'For campus or location questions, include the equivalents of campus, location, and address'
    )
    expect(request.messages[0]?.content).toContain(
      'Example University campus locations and addresses'
    )
    expect(request.messages[0]?.content).toContain(
      'Örnek Üniversitesi kampüs yerleşke adresleri'
    )
    expect(request.messages[0]?.content).toContain(
      'Örnek Üniversitesi fakülte yüksekokul akademik birimler tanıtım broşürü program listesi'
    )
    expect(request.messages[0]?.content).toContain(
      'Örnek Üniversitesi Hemşirelik güncel resmi öğrenim ücreti ücret tablosu tanıtım broşürü'
    )
    expect(request.messages[0]?.content).toContain(
      'Örnek Üniversitesi Tıp Fakültesi eğitim süresi education time years'
    )
    expect(request.messages[0]?.content).toContain(
      'MUST include local or domestic admissions, official table, and verified brochure terms'
    )
    expect(request.messages[0]?.content).toContain(
      'MUST include academic units, program catalog, and official brochure terms'
    )
    expect(request.messages[0]?.content).toContain(
      'MUST include education duration, education time, and years terms'
    )
    expect(request.messages[1]?.content).toContain(
      'Organization context:\nYüksek İhtisas Üniversitesi'
    )
    expect(request.messages[1]?.content).toContain(
      'Assistant task/scope instructions: Yüksek İhtisas Üniversitesi Tanıtım Günleri'
    )
  })

  it('allows a direct conversational response without searching the knowledge base', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'respond',
        response: 'Ben Qualy tarafından desteklenen bir yapay zeka asistanıyım.',
        response_language: 'tr',
      })
    )
    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'sen chatgpt misin',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      assistantName: 'Qualy',
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'respond',
      response: 'Ben Qualy tarafından desteklenen bir yapay zeka asistanıyım.',
      responseLanguage: 'tr',
    })

    const request = createCompletion.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(request.messages[1]?.content).toContain('Assistant identity:\nQualy')
    expect(request.messages[0]?.content).toContain(
      'If asked whether you are ChatGPT or a human, clearly say no'
    )
  })

  it('forces knowledge-seeking respond plans back through retrieval', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'respond',
        response: 'Evet, öğrenciler eğitim sırasında gerçek hasta görür.',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'Öğrenciler gerçek hasta görüyor mu?',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'search',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi Öğrenciler gerçek hasta görüyor mu?',
      responseLanguage: 'tr',
    })
  })

  it('forces shorthand institutional fact responds back through retrieval', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'respond',
        response: 'Yüksek İhtisas Üniversitesi’nin kendi hastanesi bulunmaktadır.',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'hastaneniz varmı',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'search',
      standaloneQuery: 'Yüksek İhtisas Üniversitesi hastaneniz varmı',
      responseLanguage: 'tr',
    })
  })

  it('bounds off-topic tutoring requests instead of treating them as chat', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'respond',
        response: 'Tabii, TYT matematik çalışabiliriz.',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'TYT matematik çalıştırır mısın?',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'refuse',
      refusalResponse:
        'Bu konuda ders çalıştırma yapamam; Yüksek İhtisas Üniversitesi programları, ücretleri, bursları, kontenjanları, kampüsleri veya kayıt süreciyle ilgili yardımcı olabilirim.',
      responseLanguage: 'tr',
    })
  })

  it('bounds payment credential requests even when the model tries to search', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'search',
        standalone_query: 'Yüksek İhtisas Üniversitesi IBAN ödeme bilgileri',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'IBAN gönderebilir misin?',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'refuse',
      refusalResponse:
        'Güvenliğiniz için kredi kartı, IBAN, TC kimlik, şifre veya ödeme bilgilerinizi burada paylaşmayın. Ödeme ve kayıt işlemleri için üniversitenin resmi kanallarını kullanın.',
      responseLanguage: 'tr',
    })
  })

  it('bounds card data requests even when the model tries to search', async () => {
    const createCompletion = vi.fn(async () =>
      completion({
        status: 'search',
        standalone_query: 'Yüksek İhtisas Üniversitesi kredi kartı ile ödeme',
        response_language: 'tr',
      })
    )

    const result = await rewriteSimpleRagQuery({
      latestUserMessage: 'Kredi kartı bilgilerimi buraya yazsam ödeme yapabilir miyim?',
      recentMessages: [],
      organizationContext: 'Yüksek İhtisas Üniversitesi',
      responseLanguage: 'tr',
      createCompletion,
    })

    expect(result.plan).toEqual({
      status: 'refuse',
      refusalResponse:
        'Güvenliğiniz için kredi kartı, IBAN, TC kimlik, şifre veya ödeme bilgilerinizi burada paylaşmayın. Ödeme ve kayıt işlemleri için üniversitenin resmi kanallarını kullanın.',
      responseLanguage: 'tr',
    })
  })

  it('passes explicit clarification state separately from conversation history', async () => {
    const createCompletion = vi.fn(async (_args: Record<string, unknown>) =>
      completion({
        status: 'search',
        standalone_query: 'Tıp Fakültesi Türkçe programının 2024 başarı sırası nedir?',
        response_language: 'tr',
      })
    )

    await rewriteSimpleRagQuery({
      latestUserMessage: 'Türkçe olan',
      recentMessages: [{ role: 'assistant', content: 'Türkçe mi İngilizce mi?' }],
      pendingClarification: {
        originalQuestion: 'Tıp sıralaması nedir?',
        clarificationQuestion: 'Türkçe mi İngilizce mi?',
        missingSlots: ['program_language'],
      },
      responseLanguage: 'tr',
      createCompletion,
    })

    const request = createCompletion.mock.calls[0]?.[0] as {
      messages: Array<{ role: string; content: string }>
    }
    expect(request.messages[1]?.content).toContain('Explicit state')
    expect(request.messages[1]?.content).toContain('Tıp sıralaması nedir?')
    expect(request.messages[1]?.content).toContain('Recent history')
  })

})
