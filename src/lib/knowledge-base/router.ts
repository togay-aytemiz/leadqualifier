'use server'

import OpenAI from 'openai'
import { estimateTokenCount } from '@/lib/knowledge-base/chunking'

export interface ConversationTurn {
    role: 'user' | 'assistant'
    content: string
    timestamp?: string
}

export interface KnowledgeRouteDecision {
    route_to_kb: boolean
    rewritten_query: string
    reason: string
    usage?: {
        inputTokens: number
        outputTokens: number
        totalTokens: number
    }
}

const MAX_HISTORY_ITEMS = 6
const MAX_CHARS_PER_MESSAGE = 400
const MAX_USER_TURNS = 5
const KNOWLEDGE_HINTS = [
    'nedir',
    'ne demek',
    'ne anlama',
    'ne zaman',
    'kaç',
    'hangi',
    'nasıl',
    'nerede',
    'neden',
    'kim',
    'ücret',
    'fiyat',
    'randevu',
    'iptal',
    'iade',
    'kampanya',
    'indirim',
    'paket',
    'süre',
    'saat',
    'gün',
    'politika',
    'kural',
    'protokol',
    'tanım',
    'terim',
    'kısaltma'
]

function truncate(text: string, maxChars: number) {
    if (text.length <= maxChars) return text
    return `${text.slice(0, maxChars - 1)}…`
}

function formatHistory(history: ConversationTurn[]) {
    if (history.length === 0) return 'No prior messages.'

    const filtered: ConversationTurn[] = []
    let userCount = 0

    for (let i = history.length - 1; i >= 0; i -= 1) {
        const turn = history[i]
        if (!turn) continue
        if (turn.role === 'user') {
            if (userCount >= MAX_USER_TURNS) continue
            userCount += 1
            filtered.push(turn)
            continue
        }
        if (turn.role === 'assistant') {
            const lastAssistant = filtered.find((item) => item.role === 'assistant')
            if (!lastAssistant) {
                filtered.push(turn)
            }
        }
    }

    const ordered = filtered
        .reverse()
        .slice(-MAX_HISTORY_ITEMS)

    return ordered
        .map((turn, index) => {
            const roleLabel = turn.role === 'assistant' ? 'Assistant' : 'User'
            const timestamp = turn.timestamp
                ? new Date(turn.timestamp).toISOString()
                : `step-${index + 1}`
            const content = truncate(turn.content.replace(/\s+/g, ' ').trim(), MAX_CHARS_PER_MESSAGE)
            return `${index + 1}. [${timestamp}] ${roleLabel}: ${content}`
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
            reason,
            usage: parsed?.usage
        }
    }

    return {
        route_to_kb: true,
        rewritten_query: rewrittenQueryRaw || latestMessage,
        reason,
        usage: parsed?.usage
    }
}

function buildUsageEstimate(systemPrompt: string, userPrompt: string, output: string) {
    const inputTokens = estimateTokenCount(systemPrompt) + estimateTokenCount(userPrompt)
    const outputTokens = estimateTokenCount(output)
    return {
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens
    }
}

function looksLikeKnowledgeQuestion(message: string): boolean {
    const normalized = message.trim().toLowerCase()
    if (!normalized) return false
    if (normalized.includes('?')) return true
    return KNOWLEDGE_HINTS.some((hint) => normalized.includes(hint))
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
Decide if the latest user message should be answered by the Knowledge Base (hours, pricing, policies, services, definitions, internal terms, abbreviations).
Use the recent conversation history below, which includes timestamps and ordering.
If it is a follow-up question, rewrite it into a standalone query in the user's language.
Short day/time follow-ups like "pazar?", "cuma?" or "yarın?" should be treated as KB-related follow-ups.
Return ONLY valid JSON with keys: route_to_kb (boolean), rewritten_query (string), reason (string).
If route_to_kb is false, rewritten_query must be an empty string.
If you are unsure, set route_to_kb to true.`

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
                reason: 'empty_router_response',
                usage: buildUsageEstimate(systemPrompt, userPrompt, '')
            }
        }

        const parsed = JSON.parse(content)
        const usage = completion.usage
            ? {
                inputTokens: completion.usage.prompt_tokens ?? 0,
                outputTokens: completion.usage.completion_tokens ?? 0,
                totalTokens: completion.usage.total_tokens ?? (completion.usage.prompt_tokens ?? 0) + (completion.usage.completion_tokens ?? 0)
            }
            : buildUsageEstimate(systemPrompt, userPrompt, content)

        const decision = normalizeDecision(trimmedMessage, { ...parsed, usage })
        if (!decision.route_to_kb && looksLikeKnowledgeQuestion(trimmedMessage)) {
            return {
                route_to_kb: true,
                rewritten_query: trimmedMessage,
                reason: decision.reason ? `${decision.reason};heuristic_question` : 'heuristic_question',
                usage
            }
        }
        return decision
    } catch (error) {
        console.error('KB routing error:', error)
        return {
            route_to_kb: true,
            rewritten_query: trimmedMessage,
            reason: 'router_error',
            usage: buildUsageEstimate(systemPrompt, userPrompt, '')
        }
    }
}
