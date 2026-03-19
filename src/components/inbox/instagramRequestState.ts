import type { ConversationListItem } from '@/lib/inbox/actions'
import type { Message, MessageSenderType } from '@/types/database'

type MessageMetadataHolder = {
    sender_type?: MessageSenderType
    metadata?: unknown
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseMessageMetadataRecord(metadata: unknown) {
    if (isRecord(metadata)) return metadata
    if (typeof metadata !== 'string') return null
    const trimmed = metadata.trim()
    if (!trimmed) return null
    try {
        const parsed = JSON.parse(trimmed)
        return isRecord(parsed) ? parsed : null
    } catch {
        return null
    }
}

function readTrimmedString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function readInstagramContactDisplayName(metadata: unknown): string | null {
    const parsed = parseMessageMetadataRecord(metadata)
    if (!parsed) return null
    return readTrimmedString(parsed.instagram_contact_username)
        || readTrimmedString(parsed.instagram_contact_name)
}

function isInstagramScopedId(value: string) {
    return /^\d{10,}$/.test(value)
}

function resolveMessageCandidates(
    conversation: Pick<ConversationListItem, 'messages'>,
    messageHistory: Array<Pick<Message, 'sender_type' | 'metadata'>> | null | undefined
): MessageMetadataHolder[] {
    if (Array.isArray(messageHistory) && messageHistory.length > 0) {
        return messageHistory
    }
    return Array.isArray(conversation.messages) ? conversation.messages : []
}

function resolveLatestMessageCandidate(
    candidates: MessageMetadataHolder[],
    messageHistory: Array<Pick<Message, 'sender_type' | 'metadata'>> | null | undefined
) {
    if (candidates.length === 0) return null
    if (Array.isArray(messageHistory) && messageHistory.length > 0) {
        return candidates[candidates.length - 1] ?? null
    }
    return candidates[0] ?? null
}

function hasInstagramRequestTag(tags: unknown): boolean {
    if (!Array.isArray(tags)) return false
    return tags.some((tag) => typeof tag === 'string' && tag.trim().toLowerCase() === 'instagram_request')
}

export function resolveInstagramEventSource(metadata: unknown): 'messaging' | 'standby' | null {
    const parsed = parseMessageMetadataRecord(metadata)
    if (!parsed) return null

    const sourceValue = readTrimmedString(parsed.instagram_event_source)
    if (sourceValue === 'messaging' || sourceValue === 'standby') return sourceValue

    const eventType = readTrimmedString(parsed.instagram_event_type)
    if (eventType === 'standby') return 'standby'

    return null
}

export function isInstagramRequestMessage(
    platform: ConversationListItem['platform'],
    senderType: MessageSenderType | undefined,
    metadata: unknown
): boolean {
    if (platform !== 'instagram') return false
    if (senderType !== 'contact') return false
    return resolveInstagramEventSource(metadata) === 'standby'
}

export function isInstagramRequestConversation(
    conversation: Pick<ConversationListItem, 'platform' | 'tags' | 'messages' | 'contact_name' | 'contact_phone'>,
    messageHistory?: Array<Pick<Message, 'sender_type' | 'metadata'>>
): boolean {
    if (conversation.platform !== 'instagram') return false

    const candidates = resolveMessageCandidates(conversation, messageHistory)
    const latestCandidate = resolveLatestMessageCandidate(candidates, messageHistory)
    const hasOutboundReply = candidates.some((message) => message.sender_type === 'user' || message.sender_type === 'bot')
    const latestEventSource = latestCandidate
        ? resolveInstagramEventSource(latestCandidate.metadata)
        : null

    if (latestCandidate?.sender_type && latestCandidate.sender_type !== 'contact') return false
    if (hasInstagramRequestTag(conversation.tags) && !hasOutboundReply) return true
    if (latestEventSource === 'messaging') return false
    if (latestCandidate && isInstagramRequestMessage(
        conversation.platform,
        latestCandidate.sender_type,
        latestCandidate.metadata
    )) {
        return true
    }

    const hasStandbySignal = candidates.some((message) => isInstagramRequestMessage(
        conversation.platform,
        message.sender_type,
        message.metadata
    ))
    if (hasStandbySignal && !hasOutboundReply) return true

    return false
}

export function resolveInboxContactDisplayName(
    conversation: Pick<ConversationListItem, 'platform' | 'contact_name' | 'contact_phone' | 'messages'>,
    messageHistory?: Array<Pick<Message, 'sender_type' | 'metadata'>>
): string {
    const fallbackName = readTrimmedString(conversation.contact_name)
        || readTrimmedString(conversation.contact_phone)
        || ''

    if (conversation.platform !== 'instagram') return fallbackName
    if (!isInstagramScopedId(fallbackName)) return fallbackName

    const candidates = resolveMessageCandidates(conversation, messageHistory)
    for (const message of candidates) {
        if (message.sender_type !== 'contact') continue
        const resolvedName = readInstagramContactDisplayName(message.metadata)
        if (!resolvedName) continue
        if (isInstagramScopedId(resolvedName)) continue
        return resolvedName
    }

    return fallbackName
}
