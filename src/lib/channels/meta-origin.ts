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

function resolveForwardedOrigin(forwardedHost: string | null | undefined, forwardedProto: string | null | undefined) {
    const host = readHeaderValue(forwardedHost)
    if (!host) return null

    const proto = readHeaderValue(forwardedProto) || 'https'
    return parseOrigin(`${proto}://${host}`)
}

export function resolveMetaOrigin(input: ResolveMetaOriginInput) {
    return parseOrigin(input.appUrl)
        || parseOrigin(input.siteUrl)
        || resolveForwardedOrigin(input.forwardedHost, input.forwardedProto)
        || parseOrigin(input.requestOrigin)
        || 'http://localhost:3000'
}

