import { describe, expect, it } from 'vitest'

import {
    calculateUsageCreditCost,
    estimateUsageCreditCostFromTotalTokens
} from '@/lib/billing/credit-cost'

describe('credit cost helpers', () => {
    it('calculates weighted credit usage from input/output tokens', () => {
        const credits = calculateUsageCreditCost({
            inputTokens: 1000,
            outputTokens: 500
        })

        expect(credits).toBe(1)
    })

    it('estimates credit usage from total token count', () => {
        const credits = estimateUsageCreditCostFromTotalTokens(3001)
        expect(credits).toBe(1.1)
    })

    it('clamps invalid values to zero', () => {
        expect(calculateUsageCreditCost({ inputTokens: -20, outputTokens: -10 })).toBe(0)
        expect(estimateUsageCreditCostFromTotalTokens(-1)).toBe(0)
    })
})
