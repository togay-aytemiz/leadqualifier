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
