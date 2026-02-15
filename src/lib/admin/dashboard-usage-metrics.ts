interface UsageMetricRowLike {
    totalTokens: number
    inputTokens: number
    outputTokens: number
}

const CREDIT_INPUT_WEIGHT = 1
const CREDIT_OUTPUT_WEIGHT = 4
const TOKENS_PER_CREDIT = 3000

function toNonNegativeNumber(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

export function calculateUsageCreditCost(input: {
    inputTokens: number
    outputTokens: number
}) {
    const inputTokens = toNonNegativeNumber(input.inputTokens)
    const outputTokens = toNonNegativeNumber(input.outputTokens)
    const weightedTokens = (inputTokens * CREDIT_INPUT_WEIGHT) + (outputTokens * CREDIT_OUTPUT_WEIGHT)

    if (weightedTokens <= 0) return 0
    return Math.ceil((weightedTokens / TOKENS_PER_CREDIT) * 10) / 10
}

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
