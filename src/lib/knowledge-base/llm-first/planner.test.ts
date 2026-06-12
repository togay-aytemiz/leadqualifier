import { describe, expect, it, vi } from 'vitest'

import { runLlmFirstTurnPlanner } from './planner'

function completion(payload: Record<string, unknown>) {
  return vi.fn(async () => ({
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: { prompt_tokens: 120, completion_tokens: 40, total_tokens: 160 },
  }))
}

describe('runLlmFirstTurnPlanner', () => {
  it('keeps the ranking goal when the user rejects an earlier fee interpretation', async () => {
    const createCompletion = completion({
      decision: 'search',
      resolved_question:
        '30.000 başarı sırasıyla Tıp Fakültesi Türkçe ve İngilizce programlarının geçmiş başarı sıralarını karşılaştır.',
      search_query:
        'Tıp Fakültesi Türkçe İngilizce 2024 başarı sırası 30.000 karşılaştırma',
      answer_goal:
        'Türkçe ve İngilizce Tıp satırlarını geçmiş başarı sıralarıyla temkinli karşılaştır.',
      response_language: 'tr',
      required_facts: ['Türkçe Tıp başarı sırası', 'İngilizce Tıp başarı sırası'],
      forbidden_assumptions: ['Ücret sorulduğunu varsayma', 'Yerleşme garantisi verme'],
      confidence: 0.96,
    })

    const result = await runLlmFirstTurnPlanner({
      latestUserMessage: 'Ücreti sormadım sınav sonucunda sıralamam 30bin diyorum.',
      recentMessages: [
        { role: 'user', content: 'Sıralamam 30000 hangi programı tercih edebilirim?' },
        { role: 'assistant', content: 'Hangi programı düşünüyorsunuz?' },
        { role: 'user', content: 'Tıp ama türkçe mi tutar ingilizce mi' },
        { role: 'assistant', content: 'İngilizce Tıp ücreti 720.000 TL.' },
      ],
      responseLanguage: 'tr',
      behaviorPolicy: {
        businessScopeHints: ['admissions'],
        outOfScopeHints: [],
        evidenceRequiredFor: ['programs'],
        sourcePriority: ['brochure'],
        refusalClasses: [],
        tone: ['warm', 'concise'],
      },
      createCompletion,
    })

    expect(result.plan).toMatchObject({
      decision: 'search',
      responseLanguage: 'tr',
    })
    if (result.plan.decision !== 'search') throw new Error('Expected search plan')
    expect(result.plan.resolvedQuestion).toContain('30.000')
    expect(result.plan.resolvedQuestion).toContain('başarı sıralarını')
    expect(result.plan.resolvedQuestion).not.toMatch(/ücret|fiyat/i)

    const request = createCompletion.mock.calls[0]?.[0] as {
      model?: string
      messages?: Array<{ content?: string }>
    }
    expect(request.model).toBe('gpt-4.1-mini')
    const prompt = request.messages?.map((message) => message.content ?? '').join('\n') ?? ''
    expect(prompt).toContain('The latest user correction overrides earlier assistant assumptions')
    expect(prompt).toContain('Negated or rejected intent must not become the active intent')
    expect(prompt).toContain('must preserve the unresolved user request from earlier history')
    expect(prompt).toContain('Clarify terse fragments')
    expect(prompt).toContain('answer all matching table variants')
  })

  it('routes a complete campus-location question directly to search', async () => {
    const createCompletion = completion({
      decision: 'search',
      resolved_question: 'Üniversitenin kampüsleri nerede?',
      search_query: 'üniversite kampüs yerleşke adresleri',
      search_queries: [
        'kampüs yerleşke adresleri',
        'üniversite lokasyon ulaşım kampüs',
      ],
      answer_goal: 'Kampüslerin adlarını ve doğrulanmış konumlarını açıkça belirt.',
      response_language: 'tr',
      required_facts: ['kampüs adları', 'adres veya konum'],
      forbidden_assumptions: [],
      confidence: 0.98,
    })

    const result = await runLlmFirstTurnPlanner({
      latestUserMessage: 'kampüs nerede acaba',
      recentMessages: [],
      responseLanguage: 'tr',
      behaviorPolicy: {
        businessScopeHints: ['campus'],
        outOfScopeHints: [],
        evidenceRequiredFor: ['locations'],
        sourcePriority: ['brochure'],
        refusalClasses: [],
        tone: ['warm'],
      },
      createCompletion,
    })

    expect(result.plan).toMatchObject({
      decision: 'search',
      resolvedQuestion: 'Üniversitenin kampüsleri nerede?',
      searchQuery: 'üniversite kampüs yerleşke adresleri',
      searchQueries: [
        'kampüs yerleşke adresleri',
        'üniversite lokasyon ulaşım kampüs',
      ],
    })
  })

  it('asks one specific clarification only when the subject is genuinely missing', async () => {
    const createCompletion = completion({
      decision: 'clarify',
      clarification_question: 'Hangi programın başarı sırasını öğrenmek istiyorsunuz?',
      missing_information: ['program'],
      response_language: 'tr',
      confidence: 0.94,
    })

    const result = await runLlmFirstTurnPlanner({
      latestUserMessage: 'sıralaması nedir',
      recentMessages: [],
      responseLanguage: 'tr',
      behaviorPolicy: {
        businessScopeHints: ['admissions'],
        outOfScopeHints: [],
        evidenceRequiredFor: ['programs'],
        sourcePriority: ['brochure'],
        refusalClasses: [],
        tone: ['concise'],
      },
      createCompletion,
    })

    expect(result.plan).toEqual({
      decision: 'clarify',
      clarificationQuestion: 'Hangi programın başarı sırasını öğrenmek istiyorsunuz?',
      missingInformation: ['program'],
      responseLanguage: 'tr',
      confidence: 0.94,
    })
  })
})
