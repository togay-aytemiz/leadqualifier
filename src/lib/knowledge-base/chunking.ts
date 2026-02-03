export interface ChunkingOptions {
    maxTokens?: number
    overlapTokens?: number
    maxChunks?: number
}

export interface ChunkResult {
    content: string
    tokenCount: number
}

const DEFAULT_MAX_TOKENS = 800
const DEFAULT_OVERLAP_TOKENS = 120
const DEFAULT_MAX_CHUNKS = 200

export function estimateTokenCount(text: string): number {
    const words = splitWords(text)
    return words.length
}

export function chunkText(input: string, options: ChunkingOptions = {}): ChunkResult[] {
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS
    const overlapTokens = Math.min(options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS, maxTokens - 1)
    const maxChunks = options.maxChunks ?? DEFAULT_MAX_CHUNKS

    const text = normalizeText(input)
    if (!text) return []

    const paragraphs = splitParagraphs(text)
    const segments: string[] = []

    for (const paragraph of paragraphs) {
        if (!paragraph) continue
        const tokens = estimateTokenCount(paragraph)
        if (tokens <= maxTokens) {
            segments.push(paragraph)
            continue
        }

        const sentenceSegments = splitSentences(paragraph)
        const packedSentences = packSegments(sentenceSegments, maxTokens)
        for (const segment of packedSentences) {
            const segmentTokens = estimateTokenCount(segment)
            if (segmentTokens <= maxTokens) {
                segments.push(segment)
                continue
            }

            const wordSegments = splitByWordLimit(segment, maxTokens)
            segments.push(...wordSegments)
        }
    }

    const chunks = buildChunksWithOverlap(segments, maxTokens, overlapTokens)

    if (chunks.length > maxChunks) {
        throw new Error(`Content too large for indexing (chunks=${chunks.length}, max=${maxChunks}).`)
    }

    return chunks
}

function normalizeText(text: string): string {
    return text
        .replace(/\r\n/g, '\n')
        .replace(/\r/g, '\n')
        .trim()
}

function splitParagraphs(text: string): string[] {
    const paragraphs = text
        .split(/\n\s*\n+/)
        .map((p) => p.trim())
        .filter(Boolean)

    if (paragraphs.length === 0) return [text]
    return paragraphs
}

function splitSentences(text: string): string[] {
    const sentences = text
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean)

    if (sentences.length === 0) return [text]
    return sentences
}

function splitByWordLimit(text: string, maxTokens: number): string[] {
    const words = splitWords(text)
    if (words.length <= maxTokens) return [text]

    const chunks: string[] = []
    for (let i = 0; i < words.length; i += maxTokens) {
        chunks.push(words.slice(i, i + maxTokens).join(' '))
    }
    return chunks
}

function packSegments(segments: string[], maxTokens: number): string[] {
    const packed: string[] = []
    let current: string[] = []
    let currentTokens = 0

    for (const segment of segments) {
        const tokens = estimateTokenCount(segment)
        if (currentTokens + tokens > maxTokens && current.length > 0) {
            packed.push(current.join(' '))
            current = []
            currentTokens = 0
        }

        current.push(segment)
        currentTokens += tokens
    }

    if (current.length > 0) {
        packed.push(current.join(' '))
    }

    return packed
}

function buildChunksWithOverlap(
    segments: string[],
    maxTokens: number,
    overlapTokens: number
): ChunkResult[] {
    const chunks: ChunkResult[] = []
    let currentSegments: string[] = []
    let currentTokens = 0

    for (const segment of segments) {
        const segmentTokens = estimateTokenCount(segment)
        if (segmentTokens === 0) continue

        if (currentTokens + segmentTokens > maxTokens && currentSegments.length > 0) {
            const chunkContent = currentSegments.join('\n\n')
            const tokenCount = estimateTokenCount(chunkContent)
            chunks.push({ content: chunkContent, tokenCount })

            const overlapText = overlapTokens > 0
                ? getOverlapText(chunkContent, overlapTokens)
                : ''

            currentSegments = overlapText ? [overlapText] : []
            currentTokens = overlapText ? estimateTokenCount(overlapText) : 0
        }

        currentSegments.push(segment)
        currentTokens += segmentTokens
    }

    if (currentSegments.length > 0) {
        const chunkContent = currentSegments.join('\n\n')
        chunks.push({ content: chunkContent, tokenCount: estimateTokenCount(chunkContent) })
    }

    return chunks
}

function getOverlapText(text: string, overlapTokens: number): string {
    const words = splitWords(text)
    if (words.length <= overlapTokens) return text
    return words.slice(words.length - overlapTokens).join(' ')
}

function splitWords(text: string): string[] {
    return text
        .trim()
        .split(/\s+/)
        .filter(Boolean)
}
