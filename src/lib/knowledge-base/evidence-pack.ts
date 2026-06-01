import type { RagChunk } from './rag'

export type RagEvidenceKind =
    | 'contact'
    | 'address'
    | 'duration'
    | 'policy'
    | 'platform'
    | 'document_code'
    | 'link'
    | 'generic'

export interface RagEvidenceItem {
    id: string
    kind: RagEvidenceKind
    fact: string
    quote: string
    sourceUrl: string | null
    documentId?: string
    documentTitle?: string
    chunkId?: string
    score: number
    criticalValues: string[]
}

export interface RagEvidencePack<T extends RagChunk = RagChunk> {
    items: RagEvidenceItem[]
    chunks: T[]
    diagnostics: {
        itemCount: number
        selectedChunkCount: number
        droppedDuplicateCount: number
        droppedUnsupportedCount: number
    }
}

interface BuildRagEvidencePackOptions<T extends RagChunk = RagChunk> {
    userMessage: string
    chunks: T[]
    maxItems?: number
}

interface Candidate<T extends RagChunk = RagChunk> {
    chunk: T
    kind: RagEvidenceKind
    quote: string
    fact: string
    criticalValues: string[]
    score: number
    index: number
}

const DEFAULT_MAX_ITEMS = 8

const KIND_BONUS: Record<RagEvidenceKind, number> = {
    contact: 4,
    address: 3,
    duration: 4,
    policy: 3,
    platform: 3,
    document_code: 3,
    link: 3,
    generic: 0
}

const TURKISH_NUMBER_WORDS = [
    'bir',
    'iki',
    'üç',
    'uc',
    'dört',
    'dort',
    'beş',
    'bes',
    'altı',
    'alti',
    'yedi',
    'sekiz',
    'dokuz',
    'on',
    'yirmi',
    'otuz',
    'kırk',
    'kirk',
    'elli',
    'altmış',
    'altmis',
    'yetmiş',
    'yetmis',
    'seksen',
    'doksan',
    'yüz',
    'yuz'
]
const TEXT_BOUNDARY_START = String.raw`(?<![\p{L}\p{N}_])`
const DURATION_VALUE_END = String.raw`(?=(?:dür|dur)?(?![\p{L}\p{N}_]))`
const DURATION_UNIT_PATTERN = String.raw`(?:gün(?:ü)?|hafta|ay|yıl|saat|dakika)`
const TURKISH_NUMBER_WORD_PATTERN = TURKISH_NUMBER_WORDS.join('|')
const TEXT_BOUNDARY_END = String.raw`(?![\p{L}\p{N}_])`
const PLATFORM_PATTERN = String.raw`(?:MEDU|UZEM|ÖBS|OBS|LMS|Moodle|Teams|Zoom)`
const DOCUMENT_CODE_PATTERN = String.raw`(?:[A-ZÇĞİÖŞÜ]{2,}[-_/]?\d{2,}(?:[-_/]?[A-ZÇĞİÖŞÜ0-9]+)*)`
const NUMERIC_DURATION_REGEX = new RegExp(
    `${TEXT_BOUNDARY_START}\\d+\\s*(?:iş\\s*)?${DURATION_UNIT_PATTERN}${DURATION_VALUE_END}`,
    'giu'
)
const NUMERIC_DURATION_TEST_REGEX = new RegExp(
    `${TEXT_BOUNDARY_START}\\d+\\s*(?:iş\\s*)?${DURATION_UNIT_PATTERN}${DURATION_VALUE_END}`,
    'iu'
)
const TURKISH_WORD_DURATION_REGEX = new RegExp(
    `${TEXT_BOUNDARY_START}(?:${TURKISH_NUMBER_WORD_PATTERN})(?:\\s+(?:${TURKISH_NUMBER_WORD_PATTERN}))*\\s*(?:iş\\s*)?${DURATION_UNIT_PATTERN}${DURATION_VALUE_END}`,
    'giu'
)
const TURKISH_WORD_DURATION_TEST_REGEX = new RegExp(
    `${TEXT_BOUNDARY_START}(?:${TURKISH_NUMBER_WORD_PATTERN})(?:\\s+(?:${TURKISH_NUMBER_WORD_PATTERN}))*\\s*(?:iş\\s*)?${DURATION_UNIT_PATTERN}${DURATION_VALUE_END}`,
    'iu'
)
const PLATFORM_REGEX = new RegExp(`${TEXT_BOUNDARY_START}${PLATFORM_PATTERN}${TEXT_BOUNDARY_END}`, 'giu')
const PLATFORM_TEST_REGEX = new RegExp(`${TEXT_BOUNDARY_START}${PLATFORM_PATTERN}${TEXT_BOUNDARY_END}`, 'iu')
const DOCUMENT_CODE_REGEX = new RegExp(`${TEXT_BOUNDARY_START}${DOCUMENT_CODE_PATTERN}${TEXT_BOUNDARY_END}`, 'gu')
const DOCUMENT_CODE_TEST_REGEX = new RegExp(`${TEXT_BOUNDARY_START}${DOCUMENT_CODE_PATTERN}${TEXT_BOUNDARY_END}`, 'u')

function sourceUrlFor(chunk: RagChunk) {
    return chunk.source_url ?? chunk.sourceUrl ?? null
}

function normalizeText(value: string) {
    return value
        .toLocaleLowerCase('tr')
        .replace(/\s+/g, ' ')
        .trim()
}

function uniqueValues(values: string[]) {
    const seen = new Set<string>()
    const result: string[] = []

    for (const value of values) {
        const normalized = normalizeText(value)
        if (!normalized || seen.has(normalized)) continue
        seen.add(normalized)
        result.push(value.trim())
    }

    return result
}

function tokenize(value: string) {
    return normalizeText(value)
        .split(/[^\p{L}\p{N}]+/u)
        .filter((token) => token.length > 2)
}

function lexicalOverlapScore(userMessage: string, quote: string) {
    const queryTokens = new Set(tokenize(userMessage))
    if (queryTokens.size === 0) return 0

    let overlap = 0
    for (const token of tokenize(quote)) {
        if (queryTokens.has(token)) overlap += 1
    }

    return overlap
}

function extractRegexValues(quote: string, regex: RegExp) {
    return Array.from(quote.matchAll(regex), (match) => match[0].trim())
}

function extractCriticalValues(quote: string) {
    const values: string[] = []

    values.push(...extractRegexValues(quote, /[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/gi))
    values.push(...extractRegexValues(quote, /(?:\+?\d[\d\s().-]{7,}\d)/g))
    values.push(...extractRegexValues(quote, /https?:\/\/[^\s<>"')]+/gi))
    values.push(...extractRegexValues(quote, NUMERIC_DURATION_REGEX))
    values.push(...extractRegexValues(quote, TURKISH_WORD_DURATION_REGEX))
    values.push(...extractRegexValues(quote, /%\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?%/g))
    values.push(...extractRegexValues(quote, PLATFORM_REGEX))
    values.push(...extractRegexValues(quote, DOCUMENT_CODE_REGEX))

    return uniqueValues(values)
}

function detectKind(quote: string): RagEvidenceKind | null {
    if (/[\w.!#$%&'*+/=?^`{|}~-]+@[\w-]+(?:\.[\w-]+)+/i.test(quote)) return 'contact'
    if (/(?:\+?\d[\d\s().-]{7,}\d)/.test(quote)) return 'contact'
    if (/https?:\/\/[^\s<>"')]+/i.test(quote)) return 'link'
    if (NUMERIC_DURATION_TEST_REGEX.test(quote)) return 'duration'
    if (TURKISH_WORD_DURATION_TEST_REGEX.test(quote)) return 'duration'
    if (DOCUMENT_CODE_TEST_REGEX.test(quote)) return 'document_code'
    if (PLATFORM_TEST_REGEX.test(quote)) return 'platform'
    if (/%\s?\d+(?:[.,]\d+)?|\b\d+(?:[.,]\d+)?\s?%/.test(quote)) return 'policy'
    if (/(?:adres|mahalle|cadde|sokak|bulvar|no:|kat:|ilçe|kampüs|yerleşke|address)\b/i.test(quote)) return 'address'
    if (/(?:zorunlu|gerekli|şart|koşul|politika|kural|yönetmelik|başvuru|teslim|policy|required|must)\b/i.test(quote)) return 'policy'

    return null
}

function splitLines(content: string) {
    return content
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
}

function splitSentences(content: string) {
    return content
        .split(/(?<=[.!?。])\s+|\r?\n+/u)
        .map((sentence) => sentence.trim())
        .filter(Boolean)
}

function extractEvidenceUnits(content: string) {
    const lines = splitLines(content)
    const usefulLines = lines.filter((line) => detectKind(line) !== null)

    if (usefulLines.length > 0) {
        return usefulLines
    }

    return splitSentences(content)
}

function isGenericEvidence(quote: string) {
    return tokenize(quote).length >= 4
}

function scoreCandidate(userMessage: string, chunk: RagChunk, kind: RagEvidenceKind, quote: string, criticalValues: string[]) {
    const similarityScore = (chunk.similarity ?? 0) * 10
    const kindScore = KIND_BONUS[kind]
    const valueScore = criticalValues.length > 0 ? 2 : 0

    return similarityScore + lexicalOverlapScore(userMessage, quote) + kindScore + valueScore
}

function dedupeKey(chunk: RagChunk, quote: string) {
    const source = normalizeText(sourceUrlFor(chunk) ?? '')
    const documentId = normalizeText(chunk.document_id ?? '')
    return `${source}|${documentId}|${normalizeText(quote)}`
}

function sourceChunkKey(chunk: RagChunk) {
    if (chunk.chunk_id) return `chunk:${chunk.chunk_id}`

    return [
        'content',
        normalizeText(sourceUrlFor(chunk) ?? ''),
        normalizeText(chunk.document_id ?? ''),
        normalizeText(chunk.content)
    ].join('|')
}

function hasSameEvidenceSource(chunk: RagChunk, item: RagEvidenceItem) {
    return normalizeText(sourceUrlFor(chunk) ?? '') === normalizeText(item.sourceUrl ?? '')
        && normalizeText(chunk.document_id ?? '') === normalizeText(item.documentId ?? '')
}

function chunkContainsQuote(chunk: RagChunk, quote: string) {
    return normalizeText(chunk.content).includes(normalizeText(quote))
}

export function buildRagEvidencePack<T extends RagChunk = RagChunk>({
    userMessage,
    chunks,
    maxItems = DEFAULT_MAX_ITEMS
}: BuildRagEvidencePackOptions<T>): RagEvidencePack<T> {
    const candidates: Candidate<T>[] = []
    const seen = new Set<string>()
    let droppedDuplicateCount = 0
    let droppedUnsupportedCount = 0
    let index = 0

    for (const chunk of chunks) {
        for (const quote of extractEvidenceUnits(chunk.content)) {
            const detectedKind = detectKind(quote)
            const kind = detectedKind ?? (isGenericEvidence(quote) ? 'generic' : null)

            if (!kind) {
                droppedUnsupportedCount += 1
                continue
            }

            const key = dedupeKey(chunk, quote)
            if (seen.has(key)) {
                droppedDuplicateCount += 1
                continue
            }
            seen.add(key)

            const criticalValues = extractCriticalValues(quote)
            candidates.push({
                chunk,
                kind,
                quote,
                fact: quote,
                criticalValues,
                score: scoreCandidate(userMessage, chunk, kind, quote, criticalValues),
                index
            })
            index += 1
        }
    }

    const selectedCandidates = candidates
        .sort((a, b) => b.score - a.score || a.index - b.index)
        .slice(0, maxItems)

    const selectedChunks: T[] = []
    const selectedChunkKeys = new Set<string>()
    const items = selectedCandidates.map((candidate, itemIndex) => {
        const chunkKey = sourceChunkKey(candidate.chunk)
        if (!selectedChunkKeys.has(chunkKey)) {
            selectedChunkKeys.add(chunkKey)
            selectedChunks.push(candidate.chunk)
        }

        return {
            id: `ev_${itemIndex + 1}`,
            kind: candidate.kind,
            fact: candidate.fact,
            quote: candidate.quote,
            sourceUrl: sourceUrlFor(candidate.chunk),
            documentId: candidate.chunk.document_id,
            documentTitle: candidate.chunk.document_title,
            chunkId: candidate.chunk.chunk_id,
            score: candidate.score,
            criticalValues: candidate.criticalValues
        }
    })

    return {
        items,
        chunks: selectedChunks,
        diagnostics: {
            itemCount: items.length,
            selectedChunkCount: selectedChunks.length,
            droppedDuplicateCount,
            droppedUnsupportedCount
        }
    }
}

export function buildEvidencePackContext(pack: RagEvidencePack) {
    return pack.items
        .map((item) => [
            `Evidence ID: ${item.id}`,
            `Kind: ${item.kind}`,
            `Document Title: ${item.documentTitle ?? ''}`,
            `Source URL: ${item.sourceUrl ?? ''}`,
            `Critical Values: ${item.criticalValues.join(', ')}`,
            `Quote: ${item.quote}`
        ].join('\n'))
        .join('\n\n')
}

export function collectEvidenceSourceChunks<T extends RagChunk = RagChunk>(
    pack: RagEvidencePack<T>,
    evidenceIds: string[],
    fallbackLimit = 3
) {
    const selectedIds = new Set(evidenceIds)
    const selectedItems = pack.items.filter((item) => selectedIds.has(item.id))
    const chunks: T[] = []
    const seen = new Set<string>()

    if (evidenceIds.length === 0) {
        return pack.chunks.slice(0, fallbackLimit)
    }

    if (selectedItems.length === 0) {
        return chunks
    }

    for (const item of selectedItems) {
        const chunk = item.chunkId
            ? pack.chunks.find((candidate) => candidate.chunk_id === item.chunkId)
            : pack.chunks.find((candidate) => hasSameEvidenceSource(candidate, item) && chunkContainsQuote(candidate, item.quote))

        if (!chunk) continue

        const key = sourceChunkKey(chunk)
        if (seen.has(key)) continue
        seen.add(key)
        chunks.push(chunk)
    }

    if (chunks.length > 0) {
        return chunks
    }

    return chunks
}
