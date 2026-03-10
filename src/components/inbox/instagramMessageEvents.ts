import type { ConversationListItem } from '@/lib/inbox/actions'
import type { MessageSenderType } from '@/types/database'

type SeenEventCandidate = {
    platform: ConversationListItem['platform']
    senderType: MessageSenderType | undefined
    metadata: unknown
    content?: string | null
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

function isLegacySeenContent(content: string | null | undefined) {
    if (typeof content !== 'string') return false
    const normalized = content.trim().toLowerCase()
    return normalized === '[instagram seen]' || normalized === 'instagram seen'
}

export function resolveInstagramMessageEventType(metadata: unknown): string | null {
    const parsed = parseMessageMetadataRecord(metadata)
    if (!parsed) return null
    const eventType = readTrimmedString(parsed.instagram_event_type)
    return eventType ? eventType.toLowerCase() : null
}

export function isInstagramSeenEventMessage(candidate: SeenEventCandidate): boolean {
    if (candidate.platform !== 'instagram') return false
    if (candidate.senderType !== 'contact') return false

    const eventType = resolveInstagramMessageEventType(candidate.metadata)
    if (eventType === 'seen') return true
    if (eventType && eventType !== 'seen') return false

    return isLegacySeenContent(candidate.content)
}
