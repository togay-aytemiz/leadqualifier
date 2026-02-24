import OpenAI from 'openai'
import { recordAiUsage } from '@/lib/ai/usage'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'
import { createClient } from '@/lib/supabase/server'

type SupabaseClientLike = Awaited<ReturnType<typeof createClient>>

interface EmbeddingTrackingOptions {
    organizationId?: string
    supabase?: SupabaseClientLike
    usageMetadata?: Record<string, unknown>
}

let openaiClient: OpenAI | null = null

function getOpenAIClient(): OpenAI {
    if (!openaiClient) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY environment variable is not set')
        }
        openaiClient = new OpenAI({
            apiKey: process.env.OPENAI_API_KEY,
        })
    }
    return openaiClient
}

async function recordEmbeddingUsage(
    promptTokens: number,
    options?: EmbeddingTrackingOptions
) {
    const organizationId = options?.organizationId?.trim()
    if (!organizationId) return

    await recordAiUsage({
        organizationId,
        category: 'embedding',
        model: 'text-embedding-3-small',
        inputTokens: promptTokens,
        outputTokens: 0,
        totalTokens: promptTokens,
        metadata: options?.usageMetadata ?? {},
        supabase: options?.supabase
    })
}

/**
 * Generate embedding for a single text using OpenAI text-embedding-3-small
 */
export async function generateEmbedding(
    text: string,
    options?: EmbeddingTrackingOptions
): Promise<number[]> {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    })

    const promptTokens = response.usage?.prompt_tokens ?? estimateTokenCount(text)
    await recordEmbeddingUsage(promptTokens, options)

    return response.data[0]?.embedding ?? []
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(
    texts: string[],
    options?: EmbeddingTrackingOptions
): Promise<number[][]> {
    if (texts.length === 0) return []

    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
    })

    const promptTokens = response.usage?.prompt_tokens
        ?? texts.reduce((total, text) => total + estimateTokenCount(text), 0)
    await recordEmbeddingUsage(promptTokens, options)

    return response.data.map((d) => d.embedding)
}

/**
 * Format embedding array for Supabase pgvector
 */
export function formatEmbeddingForPgvector(embedding: number[]): string {
    return `[${embedding.join(',')}]`
}
