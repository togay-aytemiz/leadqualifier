'use server'

import OpenAI from 'openai'

export interface ConversationTurn {
    role: 'user' | 'assistant'
    content: string
}

export interface KnowledgeRouteDecision {
    route_to_kb: boolean
    rewritten_query: string
    reason: string
}

const MAX_HISTORY_ITEMS = 3
const MAX_CHARS_PER_MESSAGE = 400

function truncate(text: string, maxChars: number) {
    if (text.length <= maxChars) return text
    return `${text.slice(0, maxChars - 1)}…`
}

function formatHistory(history: ConversationTurn[]) {
    if (history.length === 0) return 'No prior messages.'

    return history
        .slice(-MAX_HISTORY_ITEMS)
        .map((turn) => {
            const roleLabel = turn.role === 'assistant' ? 'Assistant' : 'User'
            const content = truncate(turn.content.replace(/\s+/g, ' ').trim(), MAX_CHARS_PER_MESSAGE)
            return `${roleLabel}: ${content}`
        })
        .join('\n')
}

function normalizeDecision(latestMessage: string, parsed: any): KnowledgeRouteDecision {
    const routeToKb = Boolean(parsed?.route_to_kb)
    const reason = typeof parsed?.reason === 'string' ? parsed.reason.trim() : ''
    const rewrittenQueryRaw = typeof parsed?.rewritten_query === 'string' ? parsed.rewritten_query.trim() : ''

    if (!routeToKb) {
        return {
            route_to_kb: false,
            rewritten_query: '',
            reason
        }
    }

    return {
        route_to_kb: true,
        rewritten_query: rewrittenQueryRaw || latestMessage,
        reason
    }
}

export async function decideKnowledgeBaseRoute(
    latestMessage: string,
    history: ConversationTurn[] = []
): Promise<KnowledgeRouteDecision> {
    const trimmedMessage = latestMessage.trim()
    if (!trimmedMessage) {
        return { route_to_kb: false, rewritten_query: '', reason: 'empty_message' }
    }

    if (!process.env.OPENAI_API_KEY) {
        return {
            route_to_kb: true,
            rewritten_query: trimmedMessage,
            reason: 'missing_openai_key'
        }
    }

    const conversation = formatHistory(history)

    const systemPrompt = `You are a routing assistant for a business chatbot.
Decide if the latest user message should be answered by the Knowledge Base (hours, pricing, policies, services).
If it is a follow-up question, rewrite it into a standalone query in the user's language.
Return ONLY valid JSON with keys: route_to_kb (boolean), rewritten_query (string), reason (string).
If route_to_kb is false, rewritten_query must be an empty string.`

    const userPrompt = `Recent conversation:\n${conversation}\n\nLatest user message: ${trimmedMessage}`

    try {
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ]
        })

        const content = completion.choices[0]?.message?.content
        if (!content) {
            return {
                route_to_kb: true,
                rewritten_query: trimmedMessage,
                reason: 'empty_router_response'
            }
        }

        const parsed = JSON.parse(content)
        return normalizeDecision(trimmedMessage, parsed)
    } catch (error) {
        console.error('KB routing error:', error)
        return {
            route_to_kb: true,
            rewritten_query: trimmedMessage,
            reason: 'router_error'
        }
    }
}
