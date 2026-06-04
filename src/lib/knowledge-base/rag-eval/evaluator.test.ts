import { describe, expect, it } from 'vitest'
import { evaluateProviderResult, summarizeProviderResults } from './evaluator'
import type { RagEvalCase, RagProviderResult } from './types'

const baseCase: RagEvalCase = {
  id: 'case-1',
  question: 'Tıbbi Laboratuvar Teknikleri yaz stajı kaç iş günü?',
  language: 'tr',
  category: 'policy_pdf',
  expectedAnswerTerms: ['Tıbbi Laboratuvar Teknikleri', '20 iş günü'],
  expectedSourceTerms: ['tlt.pdf'],
  mustNotContain: ['30 iş günü'],
}

const baseResult: RagProviderResult = {
  provider: 'openai_file_search',
  answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 20 iş günüdür.',
  citations: [
    {
      providerSourceId: 'file-1',
      title: 'TLT PDF',
      url: 'https://example.edu.tr/tlt.pdf',
    },
  ],
  refusal: false,
  timingsMs: { total: 1234 },
  usage: {
    inputTokens: 100,
    outputTokens: 40,
    toolCalls: 1,
    estimatedCredits: 0.12,
  },
}

describe('rag eval scoring', () => {
  it('scores Turkish facts and source terms with normalized matching', () => {
    expect(evaluateProviderResult(baseCase, baseResult)).toMatchObject({
      passed: true,
      answerCorrect: true,
      sourceCorrect: true,
      noHallucination: true,
      refusalCorrect: true,
      missingAnswerTerms: [],
      missingSourceTerms: [],
    })
  })

  it('fails when unsupported cases are answered instead of refused', () => {
    const unsupportedCase: RagEvalCase = {
      ...baseCase,
      unsupported: true,
      expectedAnswerTerms: [],
    }

    expect(evaluateProviderResult(unsupportedCase, baseResult)).toMatchObject({
      passed: false,
      refusalCorrect: false,
    })
  })

  it('recognizes Turkish no-clear-information refusals from answer text', () => {
    const unsupportedCase: RagEvalCase = {
      ...baseCase,
      unsupported: true,
      expectedAnswerTerms: [],
    }

    expect(
      evaluateProviderResult(unsupportedCase, {
        ...baseResult,
        answer: 'Yüklenen belgelerde bu konuda net bir bilgi bulunmamaktadır.',
        refusal: false,
      })
    ).toMatchObject({
      passed: true,
      answerCorrect: true,
      refusalCorrect: true,
    })
  })

  it('recognizes safe no-promise answers as correct unsupported conversion refusals', () => {
    const unsupportedCase: RagEvalCase = {
      ...baseCase,
      unsupported: true,
      expectedAnswerTerms: [],
    }

    expect(
      evaluateProviderResult(unsupportedCase, {
        ...baseResult,
        answer: 'Kesin kontenjan ayırma veya kabul garantisi verilemez.',
        refusal: false,
      })
    ).toMatchObject({
      passed: true,
      answerCorrect: true,
      refusalCorrect: true,
    })
  })

  it('matches descriptive labels even when natural answer word order differs', () => {
    const naturalLabelCase: RagEvalCase = {
      ...baseCase,
      expectedAnswerTerms: ['Tıp Fakültesi (İngilizce) (%50 İnd.)'],
      expectedSourceTerms: [],
      mustNotContain: [],
    }

    expect(
      evaluateProviderResult(naturalLabelCase, {
        ...baseResult,
        answer: 'İngilizce Tıp Fakültesinin %50 indirimli seçeneği için kontenjan 6 kişidir.',
      })
    ).toMatchObject({
      answerCorrect: true,
      missingAnswerTerms: [],
    })
  })

  it('supports any-of answer term groups', () => {
    const groupedCase: RagEvalCase = {
      ...baseCase,
      expectedAnswerTerms: ['Tıbbi Laboratuvar Teknikleri'],
      expectedAnyAnswerTermGroups: [['30 iş günü', '20 iş günü']],
    }

    expect(evaluateProviderResult(groupedCase, baseResult)).toMatchObject({
      passed: true,
      missingAnyAnswerTermGroups: [],
    })

    expect(
      evaluateProviderResult(
        { ...groupedCase, expectedAnyAnswerTermGroups: [['30 iş günü', '40 iş günü']] },
        baseResult
      )
    ).toMatchObject({
      passed: false,
      missingAnyAnswerTermGroups: [['30 iş günü', '40 iş günü']],
    })
  })

  it('supports any-of source term groups', () => {
    const groupedCase: RagEvalCase = {
      ...baseCase,
      expectedSourceTerms: [],
      expectedAnySourceTermGroups: [
        ['Tıbbi Laboratuvar Teknikleri Yönergesi', 'tlt.pdf'],
        ['unmatched-source', 'example.edu.tr/tlt.pdf'],
      ],
    }

    expect(evaluateProviderResult(groupedCase, baseResult)).toMatchObject({
      passed: true,
      sourceCorrect: true,
      missingAnySourceTermGroups: [],
    })

    expect(
      evaluateProviderResult(
        { ...groupedCase, expectedAnySourceTermGroups: [['unmatched-a', 'unmatched-b']] },
        baseResult
      )
    ).toMatchObject({
      passed: false,
      sourceCorrect: false,
      missingAnySourceTermGroups: [['unmatched-a', 'unmatched-b']],
    })
  })

  it('reports preferred source mismatches without failing an otherwise valid answer', () => {
    const preferredSourceCase: RagEvalCase = {
      ...baseCase,
      expectedSourceTerms: [],
      preferredSourceTerms: ['YİÜ Tanıtım Broşürü'],
    }

    expect(evaluateProviderResult(preferredSourceCase, baseResult)).toMatchObject({
      passed: true,
      answerCorrect: true,
      sourceCorrect: true,
      preferredSourceCorrect: false,
      missingPreferredSourceTerms: ['YİÜ Tanıtım Broşürü'],
    })
  })

  it('scores required and forbidden follow-ups independently', () => {
    const requiredFollowupCase: RagEvalCase = {
      ...baseCase,
      followupRequired: true,
      expectedFollowupTerms: ['burslu', '%50'],
    }
    const withFollowup: RagProviderResult = {
      ...baseResult,
      diagnostics: {
        followup:
          'İsterseniz burslu ve %50 indirimli seçenekleri de karşılaştırabilirim.',
      },
    }

    expect(evaluateProviderResult(requiredFollowupCase, withFollowup)).toMatchObject({
      passed: true,
      followupPresent: true,
      followupCorrect: true,
      missingFollowupTerms: [],
    })
    expect(evaluateProviderResult(requiredFollowupCase, baseResult)).toMatchObject({
      passed: false,
      followupPresent: false,
      followupCorrect: false,
    })
    expect(
      evaluateProviderResult({ ...baseCase, followupForbidden: true }, withFollowup)
    ).toMatchObject({
      passed: false,
      followupCorrect: false,
    })
  })

  it('flags hallucinated forbidden terms', () => {
    const result: RagProviderResult = {
      ...baseResult,
      answer: 'Tıbbi Laboratuvar Teknikleri programında yaz stajı 30 iş günüdür.',
    }

    expect(evaluateProviderResult(baseCase, result)).toMatchObject({
      passed: false,
      noHallucination: false,
      forbiddenTermsFound: ['30 iş günü'],
    })
  })

  it('does not match punctuation-only forbidden terms unless the answer contains them', () => {
    const punctuationCase = {
      ...baseCase,
      expectedAnswerTerms: [],
      mustNotContain: ['@', '₺'],
    }

    expect(
      evaluateProviderResult(punctuationCase, {
        ...baseResult,
        answer: 'Bu belgelerde doğrudan ücret bilgisi bulunmamaktadır.',
      })
    ).toMatchObject({
      passed: true,
      noHallucination: true,
      forbiddenTermsFound: [],
    })

    expect(
      evaluateProviderResult(punctuationCase, {
        ...baseResult,
        answer: 'E-posta: bilgi@example.edu.tr, ücret: 1000₺.',
      })
    ).toMatchObject({
      passed: false,
      noHallucination: false,
      forbiddenTermsFound: ['@', '₺'],
    })
  })

  it('summarizes provider latency percentiles and cost', () => {
    const summary = summarizeProviderResults([
      { ...baseResult, timingsMs: { total: 100 }, usage: { estimatedCredits: 0.1 } },
      { ...baseResult, timingsMs: { total: 300 }, usage: { estimatedCredits: 0.3 } },
      { ...baseResult, timingsMs: { total: 900 }, usage: { estimatedCredits: 0.9 } },
    ])

    expect(summary).toMatchObject({
      count: 3,
      latencyMs: { average: 433.3333333333333, p50: 300, p75: 900, p95: 900, max: 900 },
      estimatedCredits: { total: 1.3, average: 0.43333333333333335 },
    })
  })
})
