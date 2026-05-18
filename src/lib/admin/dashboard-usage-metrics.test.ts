import { describe, expect, it } from 'vitest'
import { calculateAiUsageCreditCost, summarizeUsageMetricRows } from '@/lib/admin/dashboard-usage-metrics'

describe('dashboard usage metric helpers', () => {
    it('calculates credit cost with weighted token formula', () => {
        expect(calculateAiUsageCreditCost({
            category: 'rag',
            model: 'gpt-4o-mini',
            inputTokens: 1000,
            outputTokens: 500
        })).toBe(1)
    })

    it('summarizes text embedding tokens and credits separately for admin billing visibility', () => {
        const summary = summarizeUsageMetricRows([
            {
                category: 'embedding',
                model: 'text-embedding-3-small',
                totalTokens: 22_500,
                inputTokens: 22_500,
                outputTokens: 0
            },
            {
                category: 'rag',
                model: 'gpt-4o-mini',
                totalTokens: 1500,
                inputTokens: 1000,
                outputTokens: 500
            }
        ])

        expect(summary.totalTokenCount).toBe(24_000)
        expect(summary.inputTokenCount).toBe(23_500)
        expect(summary.outputTokenCount).toBe(500)
        expect(summary.embeddingTokenCount).toBe(22_500)
        expect(summary.weightedChatTokenCount).toBe(3000)
        expect(summary.totalCreditUsage).toBe(2)
    })

    it('applies per-row credit rounding before summing totals', () => {
        const summary = summarizeUsageMetricRows([
            { totalTokens: 1, inputTokens: 1, outputTokens: 0 },
            { totalTokens: 1, inputTokens: 1, outputTokens: 0 }
        ])

        expect(summary.totalTokenCount).toBe(2)
        expect(summary.inputTokenCount).toBe(2)
        expect(summary.outputTokenCount).toBe(0)
        expect(summary.embeddingTokenCount).toBe(0)
        expect(summary.weightedChatTokenCount).toBe(2)
        expect(summary.totalCreditUsage).toBe(0.2)
    })

    it('clamps negative values to zero', () => {
        const summary = summarizeUsageMetricRows([
            { totalTokens: -50, inputTokens: -20, outputTokens: -10 }
        ])

        expect(summary.totalTokenCount).toBe(0)
        expect(summary.inputTokenCount).toBe(0)
        expect(summary.outputTokenCount).toBe(0)
        expect(summary.embeddingTokenCount).toBe(0)
        expect(summary.weightedChatTokenCount).toBe(0)
        expect(summary.totalCreditUsage).toBe(0)
    })
})
