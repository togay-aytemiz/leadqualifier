const RESPONSE_FACT_LINE_LIMIT = 14
const RESPONSE_FACT_LINE_MAX_CHARS = 260
const COVERAGE_FACET_MAX_CHARS = 120

function normalizeEmbeddingText(value: string) {
    return value.replace(/\s+/g, ' ').trim()
}

function isInternalSkillNote(line: string) {
    return /^(?:kaynak notu|source note|amaç|kullanıcı örnekleri|instructed cevap)\s*:/iu.test(line)
}

function isUsefulResponseFactLine(line: string) {
    if (!line || isInternalSkillNote(line)) return false
    if (/^[-*]\s*$/.test(line)) return false
    if (/^isters[eă]n\b|^istersen\b/iu.test(line)) return false

    return /^[-*]\s+/u.test(line)
        || /\b(?:adres|akademik birim|başarı sırası|burslu|kampüs|kampüste|kontenjan|puan türü|taban puan|ücret|ücretli|yerleşke|yerleşkesinde|%50|tl)\b/iu.test(line)
        || /\b(?:lisans|ön lisans|programıdır|fakültesi|yüksekokulu)\b/iu.test(line)
}

function buildResponseFactEmbeddingTexts(title: string, responseText: string | null | undefined) {
    const normalizedTitle = normalizeEmbeddingText(title)
    const responseLines = (responseText ?? '')
        .split(/\r?\n/u)
        .map((line) => normalizeEmbeddingText(line.replace(/^[-*]\s+/u, '')))
        .filter((line) => line.length > 0)
        .filter(isUsefulResponseFactLine)
        .slice(0, RESPONSE_FACT_LINE_LIMIT)

    return responseLines.map((line) => {
        const clippedLine = line.slice(0, RESPONSE_FACT_LINE_MAX_CHARS).trim()
        return normalizedTitle ? `${normalizedTitle}: ${clippedLine}` : clippedLine
    })
}

function buildCoverageFacetEmbeddingTexts(
    title: string,
    coverageFacets?: string[] | null
) {
    const normalizedTitle = normalizeEmbeddingText(title)
    const prefix = normalizedTitle ? `${normalizedTitle}: ` : ''
    const texts: string[] = []

    for (const facet of coverageFacets ?? []) {
        const normalizedFacet = normalizeEmbeddingText(facet)
            .slice(0, COVERAGE_FACET_MAX_CHARS)
            .trim()
        if (!normalizedFacet) continue
        texts.push(`${prefix}coverage facet: ${normalizedFacet}`)
    }

    return texts
}

export function buildSkillEmbeddingTexts(
    title: string,
    triggerExamples: string[],
    responseText?: string | null,
    _routingDescription?: string | null,
    coverageFacets?: string[] | null
): string[] {
    const candidates = [
        title,
        ...triggerExamples,
        ...buildCoverageFacetEmbeddingTexts(title, coverageFacets),
        ...buildResponseFactEmbeddingTexts(title, responseText),
    ]
    const deduped = new Set<string>()

    for (const candidate of candidates) {
        const normalized = normalizeEmbeddingText(candidate)
        if (!normalized) continue
        deduped.add(normalized)
    }

    return [...deduped]
}
