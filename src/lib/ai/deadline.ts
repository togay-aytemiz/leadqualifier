export class AiTimeoutError extends Error {
    constructor(stage: string, timeoutMs: number) {
        super(`AI stage "${stage}" exceeded ${timeoutMs}ms timeout`)
        this.name = 'AiTimeoutError'
    }
}

const DEFAULT_AI_TIMEOUT_MS = 12000

export function resolveAiTimeoutMs(stage: string, overrideMs?: number) {
    if (overrideMs && Number.isFinite(overrideMs) && overrideMs > 0) return overrideMs

    const envValue = process.env.AI_REQUEST_TIMEOUT_MS
    const parsed = envValue ? Number.parseInt(envValue, 10) : NaN
    if (Number.isFinite(parsed) && parsed > 0) return parsed

    if (stage === 'lead_extraction') return 15000
    return DEFAULT_AI_TIMEOUT_MS
}

export async function withAiTimeout<T>(
    promise: Promise<T>,
    options: {
        stage: string
        timeoutMs?: number
    }
): Promise<T> {
    const timeoutMs = resolveAiTimeoutMs(options.stage, options.timeoutMs)
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timeoutId = setTimeout(() => {
                    reject(new AiTimeoutError(options.stage, timeoutMs))
                }, timeoutMs)
            })
        ])
    } finally {
        if (timeoutId) clearTimeout(timeoutId)
    }
}
