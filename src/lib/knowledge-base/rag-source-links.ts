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
    const compacted = raw
        .replace(/\s+/g, '')
        .replace(/[)\].,;:!?]+$/g, '')
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

function normalizeEvidenceText(value: string) {
    return value
        .toLocaleLowerCase('tr-TR')
        .replace(/[ıİğĞüÜşŞöÖçÇ]/g, (char) => TURKISH_SOURCE_LINK_CHAR_MAP[char] ?? char)
        .replace(/\s+/g, ' ')
        .trim()
}

function extractEmailEvidence(value: string) {
    return value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) ?? []
}

function extractPhoneEvidence(value: string) {
    return value.match(/(?:\+?\s*90\s*)?(?:0\s*)?312[\s)./-]*329[\s)./-]*10[\s)./-]*10|(?:\+?\s*90\s*)?(?:0\s*)?312[\s)./-]*[0-9][0-9\s)./-]{5,}/gi) ?? []
}

function answerEvidenceTerms(response: string) {
    const normalized = normalizeEvidenceText(response)
    return Array.from(new Set(normalized
        .split(/[^a-z0-9@.]+/i)
        .map((token) => token.trim())
        .filter((token) => token.length >= 5)
        .filter((token) => ![
            'adres',
            'adresi',
            'bilgi',
            'bilgisi',
            'detayli',
            'burada',
            'sayfa',
            'yardimci',
            'olabilirim',
            'universitesi',
            'yuksek',
            'ihtisas'
        ].includes(token))))
}

function sourceEvidenceScore(response: string, chunk: unknown) {
    if (!isRecord(chunk)) return 0

    const chunkContent = readTrimmedString(chunk.content) ?? ''
    const searchable = normalizeEvidenceText([
        readTrimmedString(chunk.document_title ?? chunk.documentTitle) ?? '',
        readTrimmedString(chunk.source_url ?? chunk.sourceUrl) ?? '',
        chunkContent
    ].join('\n'))
    const normalizedResponse = normalizeEvidenceText(response)
    let score = 0

    for (const email of extractEmailEvidence(response)) {
        if (searchable.includes(normalizeEvidenceText(email))) score += 8
    }
    for (const phone of extractPhoneEvidence(response)) {
        const compactPhone = phone.replace(/\D/g, '')
        if (compactPhone && searchable.replace(/\D/g, '').includes(compactPhone)) score += 5
    }

    const terms = answerEvidenceTerms(response)
    for (const term of terms) {
        if (searchable.includes(term)) score += 0.35
    }

    if (normalizedResponse.includes('e-posta') || normalizedResponse.includes('email') || normalizedResponse.includes('mail')) {
        if (searchable.includes('e-posta') || searchable.includes('email') || searchable.includes('mail')) score += 1.2
    }
    if (normalizedResponse.includes('telefon') && searchable.includes('telefon')) score += 1.2

    return score
}

function collectRagSourceUrlsByResponseEvidence(response: string, chunks: unknown[], limit: number) {
    const indexedChunks = chunks.map((chunk, index) => ({ chunk, index, score: sourceEvidenceScore(response, chunk) }))
    const hasPositiveScore = indexedChunks.some((item) => item.score > 0)
    const rankedChunks = hasPositiveScore
        ? indexedChunks.sort((left, right) => right.score - left.score || left.index - right.index).map((item) => item.chunk)
        : chunks

    return collectRagSourceUrls(rankedChunks, limit)
}

const SPACED_RAW_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+(?:(?:\s+(?=[/?#])|(?<=[-_/=&#?%.])\s+)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)*/gi
const SIMPLE_RAW_URL_PATTERN = /https?:\/\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/gi
const SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN = /\b(?:[A-Za-z0-9-]{2,}\s*\.\s*)?(?:edu|com|net|org|gov)\s*\.\s*(?:tr|com|net|org|edu|gov|io|ai)\/[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+(?:(?:\s+(?=[/?#])|(?<=[-_/=&#?%.])\s+)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+)*/gi
const SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN = /(?<![@.\p{L}\p{N}-])(?:edu|com|net|org|gov)\s*\.\s*(?:tr|com|net|org|edu|gov|io|ai)\b/giu
const ORPHAN_SOURCE_PATH_FRAGMENT_PATTERN = /[\p{L}\p{N}-]{3,}\/(?=[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]*-)[A-Za-z0-9._~:/?#[\]@!$&'()*+,;=%-]+/giu

function hasRagUrlArtifact(response: string) {
    SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN.lastIndex = 0
    SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN.lastIndex = 0
    return /https?:\/\//i.test(response)
        || SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN.test(response)
        || SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN.test(response)
}

function collectResponseSourceUrls(response: string, limit: number) {
    const urls: string[] = []
    const seen = new Set<string>()
    const matches = response.match(SPACED_RAW_URL_PATTERN) ?? response.match(SIMPLE_RAW_URL_PATTERN) ?? []

    for (const match of matches) {
        const normalized = normalizeSourceUrl(match)
        if (!normalized || seen.has(normalized)) continue

        seen.add(normalized)
        urls.push(normalized)
        if (urls.length >= limit) break
    }

    return urls
}

function stripRagUrlArtifacts(response: string) {
    let stripped = response
        .replace(/\[([^\]\n]+)]\(\s*https?:\/\/[\s\S]*?\)/gi, '$1')
        .replace(SPACED_RAW_URL_PATTERN, '')
        .replace(SCHEMELESS_SPACED_SOURCE_FRAGMENT_PATTERN, '')
        .replace(SCHEMELESS_SPACED_DOMAIN_FRAGMENT_PATTERN, '')
        .replace(ORPHAN_SOURCE_PATH_FRAGMENT_PATTERN, '')

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
    options: { force?: boolean; limit?: number } = {}
) {
    const hasUrlArtifact = hasRagUrlArtifact(response)
    if (!options.force && !hasUrlArtifact) return response

    const limit = Math.max(1, options.limit ?? 2)
    const sourceUrls = collectRagSourceUrlsByResponseEvidence(response, chunks, limit)
    const urls = sourceUrls.length > 0
        ? sourceUrls
        : collectResponseSourceUrls(response, limit)
    if (urls.length === 0) return response

    const responseWithoutUrlArtifacts = hasUrlArtifact
        ? stripRagUrlArtifacts(response)
        : response.trim()

    return [
        responseWithoutUrlArtifacts,
        ...urls
    ]
        .filter(Boolean)
        .join('\n')
        .trim()
}
