import { describe, expect, it } from 'vitest'

import {
    calculateAiUsageCreditCost,
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

    it('charges text-embedding-3-small from its embedding token price instead of chat token weight', () => {
        expect(calculateAiUsageCreditCost({
            category: 'embedding',
            model: 'text-embedding-3-small',
            inputTokens: 22_500,
            outputTokens: 0
        })).toBe(1)

        expect(calculateAiUsageCreditCost({
            category: 'embedding',
            model: 'text-embedding-3-small',
            inputTokens: 22_501,
            outputTokens: 0
        })).toBe(1.1)
    })

    it('keeps non-embedding AI usage on the weighted chat-token formula', () => {
        expect(calculateAiUsageCreditCost({
            category: 'rag',
            model: 'gpt-4o-mini',
            inputTokens: 1000,
            outputTokens: 500
        })).toBe(1)
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
