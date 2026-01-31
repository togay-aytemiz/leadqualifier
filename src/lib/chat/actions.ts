'use server'

import { matchSkills } from '@/lib/skills/actions'

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

    // 3. Fallback if no match - BUT return debug info
    return {
        response: "I'm not sure how to respond to that. Can you rephrase?",
        matchedSkill: bestMatch ? {
            id: bestMatch.skill_id,
            title: bestMatch.title,
            similarity: bestMatch.similarity,
        } : undefined
    }
}
