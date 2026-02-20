import { calculateUsageCreditCost } from '@/lib/billing/credit-cost'

interface UsageMetricRowLike {
    totalTokens: number
    inputTokens: number
    outputTokens: number
}

function toNonNegativeNumber(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}
export { calculateUsageCreditCost }

export function summarizeUsageMetricRows(rows: UsageMetricRowLike[]) {
    let totalTokenCount = 0
    let totalCreditUsageTenths = 0

    for (const row of rows) {
        totalTokenCount += toNonNegativeNumber(row.totalTokens)
        totalCreditUsageTenths += Math.round(calculateUsageCreditCost({
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens
        }) * 10)
    }

    return {
        totalTokenCount,
        totalCreditUsage: totalCreditUsageTenths / 10
    }
}
