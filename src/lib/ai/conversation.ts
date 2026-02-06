export interface ConversationHistoryTurn {
    role: 'user' | 'assistant'
    content: string
    timestamp?: string
}

interface LeadSnapshotLike {
    service_type?: string | null
    extracted_fields?: Record<string, unknown> | null
}

const DEFAULT_MAX_HISTORY_TURNS = 10
const MAX_MESSAGE_CHARS = 500
const REPEATED_SPACES = /\s+/g
const GREETING_PREFIX = /^\s*(merhaba|selamlar|selam|hello|hi|hey)\b[!,.:\-\s]*/i

function normalizeContent(value: string) {
    return value.replace(REPEATED_SPACES, ' ').trim()
}

function normalizeComparableText(value: string) {
    return normalizeContent(value)
        .toLocaleLowerCase('tr')
}

function truncateContent(value: string, maxChars = MAX_MESSAGE_CHARS) {
    if (value.length <= maxChars) return value
    return `${value.slice(0, Math.max(0, maxChars - 1))}…`
}

function sanitizeLeadFactValue(value: unknown) {
    if (typeof value === 'string') {
        const normalized = normalizeContent(value)
        return normalized || null
    }
    if (typeof value === 'number' || typeof value === 'boolean') {
        return String(value)
    }
    if (Array.isArray(value)) {
        const normalized = value
            .map((item) => (typeof item === 'string' ? normalizeContent(item) : ''))
            .filter(Boolean)
            .slice(0, 3)
        return normalized.length > 0 ? normalized.join(', ') : null
    }
    return null
}

function extractLeadFacts(leadSnapshot?: LeadSnapshotLike | null) {
    if (!leadSnapshot) return []

    const facts: string[] = []
    const serviceType = sanitizeLeadFactValue(leadSnapshot.service_type)
    if (serviceType) facts.push(`service_type: ${serviceType}`)

    const extracted = leadSnapshot.extracted_fields ?? {}
    if (!extracted || typeof extracted !== 'object' || Array.isArray(extracted)) {
        return facts
    }

    const preferredKeys = ['desired_date', 'location']
    for (const key of preferredKeys) {
        const value = sanitizeLeadFactValue((extracted as Record<string, unknown>)[key])
        if (!value) continue
        facts.push(`${key}: ${value}`)
    }

    for (const [key, rawValue] of Object.entries(extracted as Record<string, unknown>)) {
        if (preferredKeys.includes(key)) continue
        const value = sanitizeLeadFactValue(rawValue)
        if (!value) continue
        facts.push(`${key}: ${value}`)
        if (facts.length >= 8) break
    }

    return facts.slice(0, 8)
}

export function normalizeConversationHistory(
    history: ConversationHistoryTurn[] = [],
    latestUserMessage?: string,
    maxTurns = DEFAULT_MAX_HISTORY_TURNS
) {
    const normalized = history
        .filter((turn): turn is ConversationHistoryTurn => turn?.role === 'user' || turn?.role === 'assistant')
        .map((turn) => ({
            role: turn.role,
            content: truncateContent(normalizeContent(turn.content ?? '')),
            timestamp: turn.timestamp
        }))
        .filter((turn) => turn.content.length > 0)

    const latestNormalized = latestUserMessage ? normalizeComparableText(latestUserMessage) : ''
    const lastTurn = normalized[normalized.length - 1]
    if (
        latestNormalized &&
        lastTurn?.role === 'user' &&
        normalizeComparableText(lastTurn.content) === latestNormalized
    ) {
        normalized.pop()
    }

    return normalized.slice(-Math.max(0, maxTurns))
}

export function toOpenAiConversationMessages(
    history: ConversationHistoryTurn[] = [],
    latestUserMessage?: string,
    maxTurns = DEFAULT_MAX_HISTORY_TURNS
) {
    return normalizeConversationHistory(history, latestUserMessage, maxTurns).map((turn) => ({
        role: turn.role,
        content: turn.content
    }))
}

export function buildConversationContinuityGuidance(options?: {
    recentAssistantMessages?: string[]
    leadSnapshot?: LeadSnapshotLike | null
}) {
    const recentAssistantMessages = (options?.recentAssistantMessages ?? [])
        .map((message) => normalizeContent(message))
        .filter(Boolean)
        .slice(-3)

    const assistantBlock = recentAssistantMessages.length > 0
        ? recentAssistantMessages.map((message, index) => `${index + 1}. ${message}`).join('\n')
        : 'none'

    const leadFacts = extractLeadFacts(options?.leadSnapshot)
    const leadFactsBlock = leadFacts.length > 0
        ? leadFacts.map((fact) => `- ${fact}`).join('\n')
        : '- none'

    return `Conversation continuity guidance:
Continue the current conversation naturally; do not restart or re-introduce from scratch.
Do not repeat greeting/opening phrases if recent assistant replies already used one.
Do not re-ask details that were already provided clearly in recent turns.
Ask at most one concise follow-up question in a single reply unless absolutely necessary.

Recent assistant replies:
${assistantBlock}

Known lead facts:
${leadFactsBlock}`
}

export function stripRepeatedGreeting(reply: string, recentAssistantMessages: string[] = []) {
    const normalizedReply = normalizeContent(reply)
    if (!normalizedReply) return reply

    const hasRecentGreeting = recentAssistantMessages
        .map((message) => normalizeContent(message))
        .some((message) => GREETING_PREFIX.test(message))

    if (!hasRecentGreeting || !GREETING_PREFIX.test(normalizedReply)) {
        return normalizedReply
    }

    const withoutGreeting = normalizedReply.replace(GREETING_PREFIX, '').trimStart()
    return withoutGreeting || normalizedReply
}
