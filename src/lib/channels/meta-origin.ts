export interface ResolveMetaOriginInput {
    appUrl?: string | null
    siteUrl?: string | null
    forwardedHost?: string | null
    forwardedProto?: string | null
    requestOrigin: string
}

function parseOrigin(value: string | null | undefined) {
    if (!value) return null
    const trimmed = value.trim()
    if (!trimmed) return null

    try {
        return new URL(trimmed).origin
    } catch {
        return null
    }
}

function readHeaderValue(value: string | null | undefined) {
    if (!value) return null
    const first = value.split(',')[0]?.trim() || null
    return first || null
}

function isLocalOrigin(origin: string | null) {
    if (!origin) return false

    try {
        const { hostname } = new URL(origin)
        return (
            hostname === 'localhost'
            || hostname === '127.0.0.1'
            || hostname === '0.0.0.0'
            || hostname === '::1'
        )
    } catch {
        return false
    }
}

function resolveForwardedOrigin(forwardedHost: string | null | undefined, forwardedProto: string | null | undefined) {
    const host = readHeaderValue(forwardedHost)
    if (!host) return null

    const proto = readHeaderValue(forwardedProto) || 'https'
    return parseOrigin(`${proto}://${host}`)
}

export function resolveMetaOrigin(input: ResolveMetaOriginInput): string {
    const requestOrigin = parseOrigin(input.requestOrigin)
    if (requestOrigin && isLocalOrigin(requestOrigin)) {
        return requestOrigin
    }

    return parseOrigin(input.appUrl)
        || parseOrigin(input.siteUrl)
        || resolveForwardedOrigin(input.forwardedHost, input.forwardedProto)
        || requestOrigin
        || 'http://localhost:3000'
}
