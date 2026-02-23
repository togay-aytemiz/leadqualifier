import { describe, expect, it } from 'vitest'

import {
    computeQaLabRunResult,
    isBudgetExhausted,
    toWeightedQaLabScore
} from '@/lib/qa-lab/evaluator'

describe('qa lab evaluator helpers', () => {
    it('returns fail_critical when at least one critical finding exists', () => {
        const result = computeQaLabRunResult([
            { severity: 'minor' },
            { severity: 'critical' }
        ])

        expect(result).toBe('fail_critical')
    })

    it('returns pass_with_findings when only major/minor findings exist', () => {
        const result = computeQaLabRunResult([
            { severity: 'major' },
            { severity: 'minor' }
        ])

        expect(result).toBe('pass_with_findings')
    })

    it('returns pass_clean when findings list is empty', () => {
        const result = computeQaLabRunResult([])
        expect(result).toBe('pass_clean')
    })

    it('returns pass_with_findings when findings are empty but scenario assessments include warn/fail', () => {
        const result = computeQaLabRunResult([], {
            scenarioAssessments: [
                { assistant_success: 'pass' },
                { assistant_success: 'warn' }
            ]
        })

        expect(result).toBe('pass_with_findings')
    })

    it('caps weighted score between 0 and 100', () => {
        expect(toWeightedQaLabScore({
            groundedness: 120,
            extractionAccuracy: 50,
            conversationQuality: -10
        })).toBe(58)

        expect(toWeightedQaLabScore({
            groundedness: -30,
            extractionAccuracy: -20,
            conversationQuality: -10
        })).toBe(0)
    })

    it('detects budget exhaustion', () => {
        expect(isBudgetExhausted(49_999, 50_000)).toBe(false)
        expect(isBudgetExhausted(50_000, 50_000)).toBe(true)
        expect(isBudgetExhausted(50_100, 50_000)).toBe(true)
    })
})
