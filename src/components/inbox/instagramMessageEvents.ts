import type { ConversationListItem } from '@/lib/inbox/actions'
import type { MessageSenderType } from '@/types/database'

type InstagramEventCandidate = {
    platform: ConversationListItem['platform']
    senderType: MessageSenderType | undefined
    metadata: unknown
    content?: string | null
}

type ConversationPreviewCandidate = {
    sender_type?: MessageSenderType
    metadata?: unknown
    content?: string | null
}

type TimelineMessageCandidate = {
    id: string
    created_at: string
    sender_type?: MessageSenderType
    metadata?: unknown
    content?: string | null
}

export interface InstagramReactionEvent {
    action: string | null
    emoji: string | null
    targetMessageId: string | null
}

type InstagramReactionSummaryLabels = {
    reacted: string
    reactedToYourMessage: string
    removed: string
    removedFromYourMessage: string
    fallback: string
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

function isLegacyReactionContent(content: string | null | undefined) {
    if (typeof content !== 'string') return false
    const normalized = content.trim().toLowerCase()
    return normalized === '[instagram reaction]'
        || normalized === 'instagram reaction'
        || normalized.startsWith('[instagram reaction] ')
}

function normalizeReactionAction(value: string | null) {
    const normalized = value?.trim().toLowerCase() ?? null
    if (!normalized) return null
    if (normalized === 'unreact' || normalized === 'remove' || normalized === 'removed') {
        return 'unreact'
    }
    if (normalized === 'react' || normalized === 'add' || normalized === 'added') {
        return 'react'
    }
    return normalized
}

function parseLegacyReactionContent(content: string | null | undefined): InstagramReactionEvent | null {
    if (!isLegacyReactionContent(content)) return null
    const rawBody = (content ?? '').replace(/^\[instagram reaction\]\s*/i, '').trim()
    if (!rawBody) {
        return {
            action: null,
            emoji: null,
            targetMessageId: null
        }
    }

    const [firstToken, ...restTokens] = rawBody.split(/\s+/)
    const normalizedAction = normalizeReactionAction(firstToken ?? null)

    if (normalizedAction) {
        const emoji = restTokens.join(' ').trim() || null
        return {
            action: normalizedAction,
            emoji,
            targetMessageId: null
        }
    }

    return {
        action: null,
        emoji: rawBody,
        targetMessageId: null
    }
}

function injectReactionEmoji(template: string, emoji: string | null) {
    if (!emoji) return template.replace(/\{emoji\}/g, '').replace(/\s+/g, ' ').trim()
    return template.replace(/\{emoji\}/g, emoji).replace(/\s+/g, ' ').trim()
}

export function resolveInstagramMessageEventType(metadata: unknown): string | null {
    const parsed = parseMessageMetadataRecord(metadata)
    if (!parsed) return null
    const eventType = readTrimmedString(parsed.instagram_event_type)
    return eventType ? eventType.toLowerCase() : null
}

export function resolveInstagramProviderMessageId(metadata: unknown): string | null {
    const parsed = parseMessageMetadataRecord(metadata)
    if (!parsed) return null
    return readTrimmedString(parsed.instagram_message_id)
}

export function resolveInstagramReactionEvent(
    metadata: unknown,
    content?: string | null | undefined
): InstagramReactionEvent | null {
    const parsed = parseMessageMetadataRecord(metadata)
    const eventType = resolveInstagramMessageEventType(metadata)

    if (eventType && eventType !== 'reaction') return null

    const metadataReaction = parsed
        ? {
            action: normalizeReactionAction(readTrimmedString(parsed.instagram_reaction_action)),
            emoji: readTrimmedString(parsed.instagram_reaction_emoji),
            targetMessageId: readTrimmedString(parsed.instagram_reaction_target_message_id)
        }
        : null

    if (metadataReaction && (metadataReaction.action || metadataReaction.emoji || metadataReaction.targetMessageId)) {
        return metadataReaction
    }

    return parseLegacyReactionContent(content)
}

export function resolveInstagramReactionSummary(args: {
    metadata: unknown
    content?: string | null
    targetSenderType?: MessageSenderType | null
    labels: InstagramReactionSummaryLabels
}) {
    const reaction = resolveInstagramReactionEvent(args.metadata, args.content)
    if (!reaction) return null

    const action = normalizeReactionAction(reaction.action)
    const targetIsOutboundMessage = args.targetSenderType === 'user' || args.targetSenderType === 'bot'

    if (action === 'unreact') {
        return targetIsOutboundMessage
            ? args.labels.removedFromYourMessage
            : args.labels.removed
    }

    if (!reaction.emoji) return args.labels.fallback

    return injectReactionEmoji(
        targetIsOutboundMessage
            ? args.labels.reactedToYourMessage
            : args.labels.reacted,
        reaction.emoji
    )
}

export function isInstagramSeenEventMessage(candidate: InstagramEventCandidate): boolean {
    if (candidate.platform !== 'instagram') return false
    if (candidate.senderType !== 'contact') return false

    const eventType = resolveInstagramMessageEventType(candidate.metadata)
    if (eventType === 'seen') return true
    if (eventType && eventType !== 'seen') return false

    return isLegacySeenContent(candidate.content)
}

export function isInstagramReactionEventMessage(candidate: InstagramEventCandidate): boolean {
    if (candidate.platform !== 'instagram') return false
    if (candidate.senderType !== 'contact') return false

    const eventType = resolveInstagramMessageEventType(candidate.metadata)
    if (eventType === 'reaction') return true
    if (eventType && eventType !== 'reaction') return false

    return isLegacyReactionContent(candidate.content)
}

export function resolveLatestNonSeenPreviewMessage(
    platform: ConversationListItem['platform'],
    messages: ConversationPreviewCandidate[] | null | undefined
): ConversationPreviewCandidate | null {
    if (!Array.isArray(messages) || messages.length === 0) return null

    for (const message of messages) {
        if (!isInstagramSeenEventMessage({
            platform,
            senderType: message.sender_type,
            metadata: message.metadata,
            content: message.content
        })) {
            return message
        }
    }

    return null
}

export function filterTimelineMessagesForDateSeparators<T extends TimelineMessageCandidate>(
    platform: ConversationListItem['platform'] | null | undefined,
    messages: T[] | null | undefined
): T[] {
    if (!Array.isArray(messages) || messages.length === 0) return []

    return messages.filter((message) => !isInstagramSeenEventMessage({
        platform: platform ?? 'simulator',
        senderType: message.sender_type,
        metadata: message.metadata,
        content: message.content
    }))
}
