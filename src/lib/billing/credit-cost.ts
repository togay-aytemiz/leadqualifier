const CREDIT_INPUT_WEIGHT = 1
const CREDIT_OUTPUT_WEIGHT = 4
const TOKENS_PER_CREDIT = 3000
const CREDIT_REFERENCE_INPUT_USD_PER_1M_TOKENS = 0.15
const CREDIT_REFERENCE_USD = (TOKENS_PER_CREDIT * CREDIT_REFERENCE_INPUT_USD_PER_1M_TOKENS) / 1_000_000
const EMBEDDING_MODEL_USD_PER_1M_TOKENS: Record<string, number> = {
    'text-embedding-3-small': 0.02,
    'text-embedding-3-large': 0.13,
    'text-embedding-ada-002': 0.10
}

function toNonNegativeNumber(value: number) {
    if (!Number.isFinite(value)) return 0
    return Math.max(0, value)
}

function ceilToSingleDecimal(value: number) {
    return Math.ceil(value * 10) / 10
}

function normalizeText(value?: string | null) {
    return (value ?? '').trim().toLowerCase()
}

export function calculateUsageCreditCost(input: {
    inputTokens: number
    outputTokens: number
}) {
    const inputTokens = toNonNegativeNumber(input.inputTokens)
    const outputTokens = toNonNegativeNumber(input.outputTokens)
    const weightedTokens = (inputTokens * CREDIT_INPUT_WEIGHT) + (outputTokens * CREDIT_OUTPUT_WEIGHT)

    if (weightedTokens <= 0) return 0
    return ceilToSingleDecimal(weightedTokens / TOKENS_PER_CREDIT)
}

export function calculateAiUsageCreditCost(input: {
    category?: string | null
    model?: string | null
    inputTokens: number
    outputTokens: number
}) {
    const category = normalizeText(input.category)
    const model = normalizeText(input.model)
    const inputTokens = toNonNegativeNumber(input.inputTokens)
    const embeddingUsdPer1MTokens = EMBEDDING_MODEL_USD_PER_1M_TOKENS[model]

    if (category === 'embedding' && embeddingUsdPer1MTokens) {
        const usdCost = (inputTokens * embeddingUsdPer1MTokens) / 1_000_000
        if (usdCost <= 0) return 0
        return ceilToSingleDecimal(usdCost / CREDIT_REFERENCE_USD)
    }

    return calculateUsageCreditCost({
        inputTokens,
        outputTokens: input.outputTokens
    })
}

export function estimateUsageCreditCostFromTotalTokens(totalTokens: number) {
    const normalizedTokens = toNonNegativeNumber(totalTokens)
    if (normalizedTokens <= 0) return 0
    return ceilToSingleDecimal(normalizedTokens / TOKENS_PER_CREDIT)
}
