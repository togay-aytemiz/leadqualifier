import { describe, expect, it, vi } from 'vitest'

import {
  shouldVerifySimpleRagEvidence,
  verifySimpleRagAnswerEvidence,
} from './evidence-verifier'

function completion(payload: Record<string, unknown>, totalTokens = 12) {
  return {
    choices: [{ message: { content: JSON.stringify(payload) } }],
    usage: {
      prompt_tokens: totalTokens - 4,
      completion_tokens: 4,
      total_tokens: totalTokens,
    },
  }
}

const chunks = [
  {
    id: 'C1',
    fileId: 'file-1',
    filename: 'program.md',
    title: 'Program Bilgileri',
    score: 0.92,
    content: 'Tıp Fakültesi programı bulunmaktadır.',
  },
]

describe('simple RAG evidence verifier', () => {
  it('only verifies risky non-no-info answers', () => {
    expect(shouldVerifySimpleRagEvidence({
      latestUserMessage: 'Afiliye hastane özel mi devlet mi?',
      answer: 'Afiliye hastane özel hastane statüsündedir.',
    })).toBe(true)

    expect(shouldVerifySimpleRagEvidence({
      latestUserMessage: 'Merhaba',
      answer: 'Merhaba, nasıl yardımcı olabilirim?',
    })).toBe(false)

    expect(shouldVerifySimpleRagEvidence({
      latestUserMessage: 'Akreditasyon var mı?',
      answer: 'Bu konuda doğrudan bilgi bulamadım.',
    })).toBe(false)
  })

  it('parses pass verdicts with usage', async () => {
    const createCompletion = vi.fn(async () =>
      completion({ verdict: 'pass', reason: 'Direct program existence evidence is present.' }, 16)
    )

    const result = await verifySimpleRagAnswerEvidence({
      latestUserMessage: 'Tıp Fakülteniz var mı?',
      standaloneQuery: 'Tıp Fakültesi var mı?',
      answer: 'Tıp Fakültesi bulunmaktadır.',
      chunks,
      responseLanguage: 'tr',
      model: 'gpt-4o-mini',
      createCompletion,
    })

    expect(createCompletion).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      status: 'pass',
      reason: 'Direct program existence evidence is present.',
      usage: { totalTokens: 16 },
    })
  })

  it('returns no-info on invalid verifier payloads for risky answers', async () => {
    const result = await verifySimpleRagAnswerEvidence({
      latestUserMessage: 'Akredite misiniz?',
      standaloneQuery: 'akreditasyon',
      answer: 'Evet, akreditedir.',
      chunks,
      responseLanguage: 'tr',
      model: 'gpt-4o-mini',
      createCompletion: vi.fn(async () => completion({ ok: true })),
    })

    expect(result).toMatchObject({
      status: 'no_info',
      reason: 'invalid_verifier_payload',
    })
  })
})
