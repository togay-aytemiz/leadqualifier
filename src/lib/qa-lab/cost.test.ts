import { describe, expect, it } from 'vitest'

import { calculateQaLabRunUsdCost } from '@/lib/qa-lab/cost'

describe('calculateQaLabRunUsdCost', () => {
    it('calculates uncached input cost', () => {
        const cost = calculateQaLabRunUsdCost({
            inputTokens: 1_000_000,
            outputTokens: 0
        })

        expect(cost).toBe(0.15)
    })

    it('calculates output cost', () => {
        const cost = calculateQaLabRunUsdCost({
            inputTokens: 0,
            outputTokens: 1_000_000
        })

        expect(cost).toBe(0.6)
    })

    it('applies cached-input discount', () => {
        const cost = calculateQaLabRunUsdCost({
            inputTokens: 1_000_000,
            outputTokens: 0,
            cachedInputTokens: 1_000_000
        })

        expect(cost).toBe(0.075)
    })

    it('calculates mixed token usage correctly', () => {
        const cost = calculateQaLabRunUsdCost({
            inputTokens: 500_000,
            outputTokens: 250_000,
            cachedInputTokens: 100_000
        })

        expect(cost).toBe(0.2175)
    })

    it('clamps invalid and oversized cached values safely', () => {
        const cost = calculateQaLabRunUsdCost({
            inputTokens: 1000,
            outputTokens: -10,
            cachedInputTokens: 2000
        })

        expect(cost).toBe(0.000075)
    })
})

