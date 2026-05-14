import { estimateTokenCount } from './chunking'

export interface RagChunk {
    content: string
    similarity?: number
    document_id?: string
    document_title?: string
    chunk_id?: string
    source_url?: string | null
    sourceUrl?: string | null
}

export interface RagContextResult<T extends RagChunk = RagChunk> {
    context: string
    chunks: T[]
    tokenCount: number
}

export interface RagContextOptions {
    maxTokens?: number
}

const DEFAULT_MAX_CONTEXT_TOKENS = 1200

function hasMetadataLine(content: string, label: string, value?: string | null) {
    if (!value) {
        return new RegExp(`^${label}:\\s*`, 'im').test(content)
    }

    return content
        .split(/\r?\n/)
        .some((line) => line.trim().toLowerCase() === `${label}: ${value}`.toLowerCase())
}

function formatChunkForContext(chunk: RagChunk) {
    const content = chunk.content.trim()
    const metadata: string[] = []
    const sourceUrl = chunk.source_url ?? chunk.sourceUrl ?? null

    if (chunk.document_title && !hasMetadataLine(content, 'Page Title') && !hasMetadataLine(content, 'Document Title')) {
        metadata.push(`Document Title: ${chunk.document_title}`)
    }

    if (sourceUrl && !hasMetadataLine(content, 'Source URL', sourceUrl)) {
        metadata.push(`Source URL: ${sourceUrl}`)
    }

    if (metadata.length === 0) return content
    return `${metadata.join('\n')}\n\n${content}`.trim()
}

export function buildRagContext<T extends RagChunk>(
    chunks: T[],
    options: RagContextOptions = {}
): RagContextResult<T> {
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS

    const selected: T[] = []
    const contextParts: string[] = []
    let tokenCount = 0

    for (const chunk of chunks) {
        const contextContent = formatChunkForContext(chunk)
        const chunkTokens = estimateTokenCount(contextContent)
        if (chunkTokens === 0) continue
        if (tokenCount + chunkTokens > maxTokens) continue

        selected.push(chunk)
        contextParts.push(contextContent)
        tokenCount += chunkTokens
    }

    return {
        context: contextParts.join('\n---\n'),
        chunks: selected,
        tokenCount
    }
}
