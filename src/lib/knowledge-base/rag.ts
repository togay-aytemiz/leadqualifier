import { estimateTokenCount } from './chunking'

export interface RagChunk {
    content: string
    similarity?: number
    document_id?: string
    document_title?: string
    chunk_id?: string
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

export function buildRagContext<T extends RagChunk>(
    chunks: T[],
    options: RagContextOptions = {}
): RagContextResult<T> {
    const maxTokens = options.maxTokens ?? DEFAULT_MAX_CONTEXT_TOKENS

    const selected: T[] = []
    const contextParts: string[] = []
    let tokenCount = 0

    for (const chunk of chunks) {
        const chunkTokens = estimateTokenCount(chunk.content)
        if (chunkTokens === 0) continue
        if (tokenCount + chunkTokens > maxTokens) continue

        selected.push(chunk)
        contextParts.push(chunk.content)
        tokenCount += chunkTokens
    }

    return {
        context: contextParts.join('\n---\n'),
        chunks: selected,
        tokenCount
    }
}
