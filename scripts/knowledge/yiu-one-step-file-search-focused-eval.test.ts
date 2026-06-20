import { describe, expect, it } from 'vitest'

import { scoreFocusedRuns } from './yiu-one-step-file-search-focused-eval'

describe('scoreFocusedRuns', () => {
  it('requires complete supported recall and zero unsupported answers', () => {
    const cases = [
      { caseId: 'supported', group: 'supported' as const, expectedStatus: 'answer' as const },
      { caseId: 'unsupported', group: 'unsupported' as const, expectedStatus: 'no_info' as const },
      { caseId: 'bounded', group: 'bounded' as const, expectedStatus: 'answer' as const, forbiddenAnswerPatterns: ['^Evet'] },
    ]

    expect(scoreFocusedRuns(cases, [
      { caseId: 'supported', status: 'answer' as const, error: null },
      { caseId: 'unsupported', status: 'answer' as const, error: null },
      { caseId: 'bounded', status: 'answer' as const, answer: 'Evet, vardır.', error: null },
    ])).toMatchObject({
      exactStatusAccuracy: 2 / 3,
      supportedRecall: 1,
      falseAnswers: 1,
      unsafeAnswers: 1,
      releaseGatePassed: false,
    })

    expect(scoreFocusedRuns(cases, [
      { caseId: 'supported', status: 'answer' as const, error: null },
      { caseId: 'unsupported', status: 'no_info' as const, error: null },
      { caseId: 'bounded', status: 'answer' as const, answer: 'Exact bilgi yok; ilgili genel bilgi şöyledir.', error: null },
    ])).toMatchObject({
      exactStatusAccuracy: 1,
      supportedRecall: 1,
      falseAnswers: 0,
      unsafeAnswers: 0,
      releaseGatePassed: true,
    })
  })
})
