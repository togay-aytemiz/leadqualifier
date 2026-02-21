const TOKENS_PER_MILLION = 1_000_000

const GPT_4O_MINI_INPUT_USD_PER_MILLION = 0.15
const GPT_4O_MINI_INPUT_CACHE_USD_PER_MILLION = 0.075
const GPT_4O_MINI_OUTPUT_USD_PER_MILLION = 0.60

function toNonNegativeNumber(value: unknown) {
    const numeric = typeof value === 'number' ? value : Number(value)
    if (!Number.isFinite(numeric)) return 0
    return Math.max(0, numeric)
}

function roundToSixDecimals(value: number) {
    return Math.round(value * 1_000_000) / 1_000_000
}

export function calculateQaLabRunUsdCost(input: {
    inputTokens: number
    outputTokens: number
    cachedInputTokens?: number
}) {
    const inputTokens = toNonNegativeNumber(input.inputTokens)
    const outputTokens = toNonNegativeNumber(input.outputTokens)
    const cachedInputTokens = Math.min(
        inputTokens,
        toNonNegativeNumber(input.cachedInputTokens)
    )
    const uncachedInputTokens = Math.max(0, inputTokens - cachedInputTokens)

    const costUsd = (
        (uncachedInputTokens / TOKENS_PER_MILLION) * GPT_4O_MINI_INPUT_USD_PER_MILLION
        + (cachedInputTokens / TOKENS_PER_MILLION) * GPT_4O_MINI_INPUT_CACHE_USD_PER_MILLION
        + (outputTokens / TOKENS_PER_MILLION) * GPT_4O_MINI_OUTPUT_USD_PER_MILLION
    )

    return roundToSixDecimals(costUsd)
}

