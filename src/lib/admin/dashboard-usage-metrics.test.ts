import { describe, expect, it } from 'vitest'
import { calculateUsageCreditCost, summarizeUsageMetricRows } from '@/lib/admin/dashboard-usage-metrics'

describe('dashboard usage metric helpers', () => {
    it('calculates credit cost with weighted token formula', () => {
        expect(calculateUsageCreditCost({ inputTokens: 1000, outputTokens: 500 })).toBe(1)
    })

    it('applies per-row credit rounding before summing totals', () => {
        const summary = summarizeUsageMetricRows([
            { totalTokens: 1, inputTokens: 1, outputTokens: 0 },
            { totalTokens: 1, inputTokens: 1, outputTokens: 0 }
        ])

        expect(summary.totalTokenCount).toBe(2)
        expect(summary.totalCreditUsage).toBe(0.2)
    })

    it('clamps negative values to zero', () => {
        const summary = summarizeUsageMetricRows([
            { totalTokens: -50, inputTokens: -20, outputTokens: -10 }
        ])

        expect(summary.totalTokenCount).toBe(0)
        expect(summary.totalCreditUsage).toBe(0)
    })
})
