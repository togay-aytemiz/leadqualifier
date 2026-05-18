import { calculateAiUsageCreditCost } from '@/lib/billing/credit-cost'

interface UsageMetricRowLike {
    category?: string | null
    model?: string | null
    totalTokens: number
    inputTokens: number
    outputTokens: number
}

function toNonNegativeNumber(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}
export { calculateAiUsageCreditCost }

export function summarizeUsageMetricRows(rows: UsageMetricRowLike[]) {
    let totalTokenCount = 0
    let inputTokenCount = 0
    let outputTokenCount = 0
    let embeddingTokenCount = 0
    let weightedChatTokenCount = 0
    let totalCreditUsageTenths = 0

    for (const row of rows) {
        const category = row.category?.trim().toLowerCase() ?? ''
        const inputTokens = toNonNegativeNumber(row.inputTokens)
        const outputTokens = toNonNegativeNumber(row.outputTokens)
        const totalTokens = toNonNegativeNumber(row.totalTokens)

        totalTokenCount += totalTokens
        inputTokenCount += inputTokens
        outputTokenCount += outputTokens

        if (category === 'embedding') {
            embeddingTokenCount += inputTokens
        } else {
            weightedChatTokenCount += inputTokens + (outputTokens * 4)
        }

        totalCreditUsageTenths += Math.round(calculateAiUsageCreditCost({
            category: row.category,
            model: row.model,
            inputTokens: row.inputTokens,
            outputTokens: row.outputTokens
        }) * 10)
    }

    return {
        totalTokenCount,
        inputTokenCount,
        outputTokenCount,
        embeddingTokenCount,
        weightedChatTokenCount,
        totalCreditUsage: totalCreditUsageTenths / 10
    }
}
