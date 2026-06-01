import type { RagChunk } from './rag'

export type HybridSearchChannelName =
    | 'vector'
    | 'keyword'
    | 'title_source'
    | 'focused_evidence'
    | 'planned'

export interface HybridSearchChannel<T extends RagChunk> {
    name: HybridSearchChannelName
    results: T[]
    weight?: number
}

export type HybridRagResult<T extends RagChunk> = T & {
    rrf?: {
        score: number
        channels: HybridSearchChannelName[]
    }
}

export interface MergeHybridRagResultsInput<T extends RagChunk> {
    query: string
    channels: Array<HybridSearchChannel<T>>
    limit: number
    rankConstant?: number
}

const DEFAULT_RRF_RANK_CONSTANT = 60

function normalizeContentKey(value: string | null | undefined) {
    return (value ?? '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLocaleLowerCase('tr-TR')
}

function getChunkIdentity(chunk: RagChunk) {
    const chunkId = chunk.chunk_id?.trim()
    if (chunkId) return `chunk:${chunkId}`

    const documentId = chunk.document_id?.trim() || 'unknown-document'
    return `doc-content:${documentId}:${normalizeContentKey(chunk.content)}`
}

function getSimilarity(chunk: RagChunk) {
    return Number.isFinite(chunk.similarity) ? Number(chunk.similarity) : 0
}

export function mergeHybridRagResults<T extends RagChunk>({
    channels,
    limit,
    rankConstant = DEFAULT_RRF_RANK_CONSTANT
}: MergeHybridRagResultsInput<T>): Array<HybridRagResult<T>> {
    if (limit <= 0) return []

    const merged = new Map<string, {
        result: T
        score: number
        channels: HybridSearchChannelName[]
        bestSimilarity: number
        firstSeenIndex: number
    }>()
    let nextSeenIndex = 0

    for (const channel of channels) {
        const weight = channel.weight ?? 1
        const seenInChannel = new Set<string>()

        channel.results.forEach((result, index) => {
            const key = getChunkIdentity(result)
            if (seenInChannel.has(key)) return
            seenInChannel.add(key)

            const contribution = weight / (rankConstant + index + 1)
            const existing = merged.get(key)
            const similarity = getSimilarity(result)

            if (!existing) {
                merged.set(key, {
                    result,
                    score: contribution,
                    channels: [channel.name],
                    bestSimilarity: similarity,
                    firstSeenIndex: nextSeenIndex++
                })
                return
            }

            existing.score += contribution
            if (!existing.channels.includes(channel.name)) {
                existing.channels.push(channel.name)
            }
            if (similarity > existing.bestSimilarity) {
                existing.result = result
                existing.bestSimilarity = similarity
            }
        })
    }

    return Array.from(merged.values())
        .sort((left, right) => {
            const scoreDelta = right.score - left.score
            if (scoreDelta !== 0) return scoreDelta

            const similarityDelta = right.bestSimilarity - left.bestSimilarity
            if (similarityDelta !== 0) return similarityDelta

            return left.firstSeenIndex - right.firstSeenIndex
        })
        .slice(0, limit)
        .map((entry) => ({
            ...entry.result,
            similarity: entry.bestSimilarity,
            rrf: {
                score: entry.score,
                channels: entry.channels
            }
        }))
}
