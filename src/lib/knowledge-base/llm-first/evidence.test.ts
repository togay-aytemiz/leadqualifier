import { describe, expect, it, vi } from 'vitest'

import { composeLlmFirstGroundedAnswer } from './evidence'

const chunks = [
  {
    content:
      'Tıp Fakültesi (Ücretli) 2024 başarı sırası 36.073. Tıp Fakültesi (İngilizce) (Ücretli) 2024 başarı sırası 39.907.',
    document_id: 'tip-table',
    document_title: 'Tıp Fakültesi Kontenjanları',
  },
]

function completion(answer: string) {
  return vi.fn(async () => ({
    choices: [
      {
        message: {
          content: JSON.stringify({ answer, used_evidence_ids: ['E1'] }),
        },
      },
    ],
  }))
}

describe('composeLlmFirstGroundedAnswer', () => {
  it('allows a number supplied by the user while grounding new numbers in evidence', async () => {
    const result = await composeLlmFirstGroundedAnswer({
      resolvedQuestion:
        '30.000 sıralamayla Türkçe ve İngilizce Tıp programlarından hangisi tercih edilebilir?',
      answerGoal: 'İki programı geçmiş başarı sıralarıyla karşılaştır.',
      requiredFacts: [],
      forbiddenAssumptions: ['Yerleşme garantisi verme'],
      responseLanguage: 'tr',
      chunks,
      model: 'gpt-4o-mini',
      createCompletion: completion(
        '30.000 sıralama, 2024 verisinde Türkçe Tıp için 36.073 ve İngilizce Tıp için 39.907 olan başarı sıralarından daha iyi görünüyor; ancak bu yerleşme garantisi değildir.'
      ),
    })

    expect(result?.answer).toContain('30.000')
  })

  it('rejects a new numeric claim absent from both the question and evidence', async () => {
    const result = await composeLlmFirstGroundedAnswer({
      resolvedQuestion: 'Türkçe ve İngilizce Tıp sıralamalarını karşılaştır.',
      answerGoal: 'İki programı karşılaştır.',
      requiredFacts: [],
      forbiddenAssumptions: [],
      responseLanguage: 'tr',
      chunks,
      model: 'gpt-4o-mini',
      createCompletion: completion('2024 başarı sırası Türkçe Tıp için 36.073, İngilizce Tıp için 42.000.'),
    })

    expect(result).toBeNull()
  })
})
