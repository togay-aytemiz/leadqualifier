import { describe, expect, it } from 'vitest'

import {
    classifyClarificationFlow,
    routeFromFileSearchFailureReason,
    routeFromFileSearchAnswerStatus,
    validateClarificationCases
} from './yiu-clarification-cases'

const validCases = [
    {
        id: 'fees-program',
        firstMessage: 'ücreti ne kadar acaba',
        shortReply: 'anestezi',
        expectedSubject: 'Anestezi',
        expectedFacet: 'ücret',
        rationale: 'Program adı eksik.'
    }
]

describe('validateClarificationCases', () => {
    it('accepts unique realistic cases with slot-only short replies', () => {
        expect(validateClarificationCases(validCases, 1)).toEqual(validCases)
    })

    it.each(['evet', 'olur', 'tamam', 'devam et'])('rejects generic acceptance reply %s', (shortReply) => {
        expect(() => validateClarificationCases([{ ...validCases[0], shortReply }], 1))
            .toThrow(/slot-only/i)
    })

    it('rejects duplicate case ids and unexpected fixture counts', () => {
        expect(() => validateClarificationCases([...validCases, validCases[0]], 2)).toThrow(/unique/i)
        expect(() => validateClarificationCases(validCases, 20)).toThrow(/20 cases/i)
    })
})

describe('classifyClarificationFlow', () => {
    it('only resolves when the first turn clarifies and the second turn answers', () => {
        expect(classifyClarificationFlow({
            firstRoute: 'rag_clarify',
            firstError: null,
            secondRoute: 'skill_answered',
            secondError: null
        })).toBe('resolved')
        expect(classifyClarificationFlow({
            firstRoute: 'rag_clarify',
            firstError: null,
            secondRoute: 'rag_clarify',
            secondError: null
        })).toBe('repeated_clarification')
    })

    it('keeps first-turn misses and request errors visible', () => {
        expect(classifyClarificationFlow({
            firstRoute: 'rag_grounded_answer',
            firstError: null,
            secondRoute: null,
            secondError: null
        })).toBe('first_not_clarification')
        expect(classifyClarificationFlow({
            firstRoute: 'error',
            firstError: 'timeout',
            secondRoute: null,
            secondError: null
        })).toBe('error')
        expect(classifyClarificationFlow({
            firstRoute: 'rag_pipeline_error',
            firstError: null,
            secondRoute: null,
            secondError: null
        })).toBe('error')
    })
})

describe('routeFromFileSearchAnswerStatus', () => {
    it('reads the current one-step File Search status vocabulary', () => {
        expect(routeFromFileSearchAnswerStatus('clarify')).toBe('rag_clarify')
        expect(routeFromFileSearchAnswerStatus('refuse')).toBe('rag_refuse')
        expect(routeFromFileSearchAnswerStatus('no_info')).toBe('rag_no_info')
        expect(routeFromFileSearchAnswerStatus('answer')).toBeNull()
    })
})

describe('routeFromFileSearchFailureReason', () => {
    it('keeps infrastructure failures out of no-info results', () => {
        expect(routeFromFileSearchFailureReason('pipeline_error')).toBe('rag_pipeline_error')
        expect(routeFromFileSearchFailureReason('missing_api_key')).toBe('rag_pipeline_error')
        expect(routeFromFileSearchFailureReason(null)).toBeNull()
    })
})
