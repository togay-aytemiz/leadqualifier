'use server'

import { matchSkills } from '@/lib/skills/actions'
import { buildRagContext } from '@/lib/knowledge-base/rag'

export interface ChatMessage {
    id: string
    role: 'user' | 'system'
    content: string
    timestamp: Date
    status: 'sent' | 'delivered' | 'read'
}

export interface SimulationResponse {
    response: string
    matchedSkill?: {
        id: string
        title: string
        similarity: number
    }
}

export async function simulateChat(
    message: string,
    organizationId: string,
    threshold: number = 0.5
): Promise<SimulationResponse> {
    // 1. Match skills with ZERO threshold to get ANY match for debugging
    console.log(`Simulating chat for: "${message}" in org: ${organizationId} with threshold: ${threshold}`)
    const matches = await matchSkills(message, organizationId, 0.0)
    console.log('Matches found:', JSON.stringify(matches, null, 2))

    const activeThreshold = threshold; // Use dynamic threshold
    const bestMatch = matches?.[0];

    // 2. Determine response
    if (bestMatch && bestMatch.similarity >= activeThreshold) {
        return {
            response: bestMatch.response_text,
            matchedSkill: {
                id: bestMatch.skill_id,
                title: bestMatch.title,
                similarity: bestMatch.similarity,
            },
        }
    }

    // 3. Fallback: Check Knowledge Base (RAG)
    try {
        const { searchKnowledgeBase } = await import('@/lib/knowledge-base/actions')
        const kbResults = await searchKnowledgeBase(message, organizationId, 0.5, 6)

        if (kbResults && kbResults.length > 0) {
            const { default: OpenAI } = await import('openai')
            const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

            const { context } = buildRagContext(kbResults)
            if (!context) {
                throw new Error('RAG context is empty')
            }

            const noAnswerToken = 'NO_ANSWER'
            const systemPrompt = `You are a helpful assistant for a business. 
Answer the user's question based strictly on the provided context below. 
If the answer is not in the context, respond with "${noAnswerToken}" and do not make up facts.
Keep the answer concise and friendly.

Context:
${context}`

            const completion = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: message }
                ],
                temperature: 0.3
            })

            const ragResponse = completion.choices[0]?.message?.content

            const normalizedResponse = ragResponse?.trim() ?? ''
            if (normalizedResponse && !normalizedResponse.includes(noAnswerToken)) {
                return {
                    response: normalizedResponse,
                    matchedSkill: {
                        id: 'rag-knowledge-base',
                        title: '📚 Knowledge Base',
                        similarity: kbResults[0].similarity
                    }
                }
            }
        }
    } catch (error) {
        console.error('RAG Simulation Error:', error)
    }

    // 4. Final Fallback
    return {
        response: "I'm not sure how to respond to that. Can you rephrase? (No skill or knowledge found)",
        matchedSkill: bestMatch ? {
            id: bestMatch.skill_id,
            title: bestMatch.title,
            similarity: bestMatch.similarity,
        } : undefined
    }
}
