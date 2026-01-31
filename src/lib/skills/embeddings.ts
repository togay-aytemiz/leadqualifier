import OpenAI from 'openai'

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

/**
 * Generate embedding for a single text using OpenAI text-embedding-3-small
 */
export async function generateEmbedding(text: string): Promise<number[]> {
    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
    })

    return response.data[0]?.embedding ?? []
}

/**
 * Generate embeddings for multiple texts in batch
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return []

    const openai = getOpenAIClient()
    const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: texts,
    })

    return response.data.map((d) => d.embedding)
}

/**
 * Format embedding array for Supabase pgvector
 */
export function formatEmbeddingForPgvector(embedding: number[]): string {
    return `[${embedding.join(',')}]`
}
