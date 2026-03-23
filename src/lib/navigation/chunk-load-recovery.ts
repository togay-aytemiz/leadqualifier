export const CHUNK_RETRY_PARAM = '__chunk_retry'
export const CHUNK_RETRY_SESSION_KEY = 'leadqualifier.chunk-retry-path'

const CHUNK_LOAD_ERROR_PATTERNS = [
    /ChunkLoadError/i,
    /Failed to load chunk/i,
    /Loading chunk [\w-]+ failed/i,
    /Loading CSS chunk [\w-]+ failed/i
]

export function shouldRecoverFromChunkError(input: {
    message?: string | null
    scriptSrc?: string | null
}) {
    const message = (input.message ?? '').trim()
    if (message && CHUNK_LOAD_ERROR_PATTERNS.some((pattern) => pattern.test(message))) {
        return true
    }

    const scriptSrc = (input.scriptSrc ?? '').trim()
    return /\/_next\/static\/(?:chunks|css)\//.test(scriptSrc)
}

export function shouldAttemptChunkRecovery(
    previousAttemptPath: string | null,
    currentPath: string
) {
    return previousAttemptPath !== currentPath
}

export function buildChunkRecoveryUrl(currentUrl: string, nonce: number = Date.now()) {
    const url = new URL(currentUrl)
    url.searchParams.set(CHUNK_RETRY_PARAM, String(nonce))
    return url.toString()
}
