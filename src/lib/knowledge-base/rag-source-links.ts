function readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function normalizeSourceUrl(value: unknown) {
    const raw = readTrimmedString(value)
    if (!raw) return null
    const compacted = raw.replace(/\s+/g, '')
    try {
        const parsed = new URL(compacted)
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
        return parsed.toString()
    } catch {
        return null
    }
}

function extractSourceUrlFromText(value: unknown) {
    const content = readTrimmedString(value)
    if (!content) return null

    const rawUrl = content.match(/^Source URL:\s*(.+)$/im)?.[1]?.trim()
    return normalizeSourceUrl(rawUrl)
}

export function collectRagSourceUrls(chunks: unknown[], limit = 2) {
    const urls: string[] = []
    const seen = new Set<string>()

    for (const chunk of chunks) {
        if (!isRecord(chunk)) continue
        const sourceUrl = normalizeSourceUrl(chunk.source_url ?? chunk.sourceUrl)
            ?? extractSourceUrlFromText(chunk.content)
        if (!sourceUrl || seen.has(sourceUrl)) continue

        seen.add(sourceUrl)
        urls.push(sourceUrl)
        if (urls.length >= limit) break
    }

    return urls
}

const SPACED_RAW_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+(?:(?:\s+(?=[/?#])|(?<=[-_/=&#?%.])\s+)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)*/gi
const SIMPLE_RAW_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi

function stripRagUrlArtifacts(response: string) {
    let stripped = response
        .replace(/\[([^\]\n]+)]\(\s*https?:\/\/[\s\S]*?\)/gi, '$1')
        .replace(SPACED_RAW_URL_PATTERN, '')

    if (/https?:\/\/\s/i.test(stripped)) {
        stripped = stripped.replace(/https?:\/\/[\s\S]*$/i, '')
    } else {
        stripped = stripped.replace(SIMPLE_RAW_URL_PATTERN, '')
    }

    return stripped
        .replace(/\s+([,.;!?])/g, '$1')
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim()
}

const TURKISH_SOURCE_LINK_CHAR_MAP: Record<string, string> = {
    ı: 'i',
    İ: 'i',
    ğ: 'g',
    Ğ: 'g',
    ü: 'u',
    Ü: 'u',
    ş: 's',
    Ş: 's',
    ö: 'o',
    Ö: 'o',
    ç: 'c',
    Ç: 'c'
}

export function isLikelySourceLinkRequest(message: string | null | undefined) {
    const normalized = (message ?? '')
        .toLocaleLowerCase('tr-TR')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_SOURCE_LINK_CHAR_MAP[char] ?? char)

    return /\b(link|url|baglanti|sayfa|nerede|nereden|ulas|erisebilir|paylas|gonder|pdf|dokuman|belge)\b/i.test(normalized)
}

export function appendCanonicalRagSourceLinks(
    response: string,
    chunks: unknown[],
    options: { force?: boolean } = {}
) {
    if (!options.force && !/https?:\/\//i.test(response)) return response

    const sourceUrls = collectRagSourceUrls(chunks)
    if (sourceUrls.length === 0) return response

    const responseWithoutUrlArtifacts = /https?:\/\//i.test(response)
        ? stripRagUrlArtifacts(response)
        : response.trim()

    return [
        responseWithoutUrlArtifacts,
        ...sourceUrls
    ]
        .filter(Boolean)
        .join('\n')
        .trim()
}
