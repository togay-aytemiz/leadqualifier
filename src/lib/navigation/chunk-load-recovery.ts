export const CHUNK_RETRY_PARAM = '__chunk_retry'
export const CHUNK_RETRY_SESSION_KEY = 'leadqualifier.chunk-retry-path'
export const CHUNK_PENDING_ROUTE_SESSION_KEY = 'leadqualifier.chunk-pending-route'

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
    return normalizeChunkRecoveryPath(previousAttemptPath) !== normalizeChunkRecoveryPath(currentPath)
}

function normalizeChunkRecoveryPath(value: string | null | undefined) {
    if (!value) return '/'

    const trimmed = value.trim()
    if (!trimmed) return '/'

    const parsed = trimmed.startsWith('http://') || trimmed.startsWith('https://')
        ? new URL(trimmed)
        : new URL(trimmed.startsWith('/') ? trimmed : `/${trimmed}`, 'https://askqualy.local')
    const withoutLocale = parsed.pathname.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/'

    return withoutLocale.length > 1 && withoutLocale.endsWith('/')
        ? withoutLocale.slice(0, -1)
        : withoutLocale
}

function resolveChunkRecoveryTargetUrl(currentUrl: URL, pendingTargetPath?: string | null) {
    const trimmedTargetPath = pendingTargetPath?.trim()
    if (!trimmedTargetPath) {
        return new URL(currentUrl.toString())
    }

    const targetUrl = new URL(trimmedTargetPath, currentUrl.origin)
    const currentLocalePrefixMatch = currentUrl.pathname.match(/^\/([a-z]{2})(?=\/|$)/)
    const targetLocalePrefixMatch = targetUrl.pathname.match(/^\/([a-z]{2})(?=\/|$)/)

    if (currentLocalePrefixMatch && !targetLocalePrefixMatch) {
        const [, localePrefix] = currentLocalePrefixMatch
        const normalizedPathname = targetUrl.pathname === '/' ? '' : targetUrl.pathname
        targetUrl.pathname = `/${localePrefix}${normalizedPathname || '/'}`
    }

    return targetUrl
}

export function buildChunkRecoveryUrl(
    currentUrl: string,
    nonce: number = Date.now(),
    pendingTargetPath?: string | null
) {
    const url = new URL(currentUrl)
    const recoveryTargetUrl = resolveChunkRecoveryTargetUrl(url, pendingTargetPath)
    recoveryTargetUrl.searchParams.set(CHUNK_RETRY_PARAM, String(nonce))
    return recoveryTargetUrl.toString()
}
