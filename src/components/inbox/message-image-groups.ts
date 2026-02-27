import type { Message } from '@/types/database'
import {
    extractMediaFromMessageMetadata,
    type InboxMessageMedia
} from '@/components/inbox/messageMedia'

const DEFAULT_GROUP_MAX_GAP_MS = 90_000

export interface InboxImageGalleryItem {
    message: Message
    media: InboxMessageMedia & {
        type: 'image'
        url: string
    }
}

export interface InboxImageGalleryGroup {
    startMessageId: string
    senderType: Message['sender_type']
    items: InboxImageGalleryItem[]
}

export interface InboxImageGalleryLookup {
    groupedMessageIds: Set<string>
    groupsByStartId: Map<string, InboxImageGalleryGroup>
}

function hasVisibleMessageText(message: Message, media: InboxMessageMedia) {
    if (media.caption) return true

    const content = typeof message.content === 'string'
        ? message.content.trim()
        : ''
    if (content.length === 0) return false

    if (media.isPlaceholder && !media.caption) return false
    return true
}

function toImageMediaWithUrl(
    media: InboxMessageMedia | null
): (InboxMessageMedia & { type: 'image'; url: string }) | null {
    if (!media) return null
    if (media.type !== 'image') return null
    if (!media.url) return null
    return {
        ...media,
        type: 'image',
        url: media.url
    }
}

function resolveImageGalleryItem(message: Message): InboxImageGalleryItem | null {
    if (message.sender_type === 'system') return null

    const media = toImageMediaWithUrl(extractMediaFromMessageMetadata(message.metadata))
    if (!media) return null
    if (hasVisibleMessageText(message, media)) return null

    return {
        message,
        media
    }
}

function toDateValue(isoTimestamp: string) {
    const parsed = new Date(isoTimestamp)
    const time = parsed.getTime()
    return Number.isFinite(time) ? time : Number.NaN
}

function isWithinGap(previousCreatedAt: string, nextCreatedAt: string, maxGapMs: number) {
    const previousTime = toDateValue(previousCreatedAt)
    const nextTime = toDateValue(nextCreatedAt)
    if (!Number.isFinite(previousTime) || !Number.isFinite(nextTime)) return false
    const difference = nextTime - previousTime
    return difference >= 0 && difference <= maxGapMs
}

export function buildInboxImageGalleryLookup(
    messages: Message[],
    options?: {
        maxGapMs?: number
    }
): InboxImageGalleryLookup {
    const maxGapMs = Number.isFinite(options?.maxGapMs ?? Number.NaN)
        ? Math.max(0, Math.floor(options?.maxGapMs ?? DEFAULT_GROUP_MAX_GAP_MS))
        : DEFAULT_GROUP_MAX_GAP_MS

    const groupedMessageIds = new Set<string>()
    const groupsByStartId = new Map<string, InboxImageGalleryGroup>()

    for (let index = 0; index < messages.length; index += 1) {
        const currentMessage = messages[index]
        if (!currentMessage) continue

        const firstItem = resolveImageGalleryItem(currentMessage)
        if (!firstItem) continue

        const items: InboxImageGalleryItem[] = [firstItem]
        let cursor = index + 1

        while (cursor < messages.length) {
            const previousItem = items[items.length - 1]
            if (!previousItem) break

            const nextMessage = messages[cursor]
            if (!nextMessage) break

            const nextItem = resolveImageGalleryItem(nextMessage)
            if (!nextItem) break

            if (nextItem.message.sender_type !== firstItem.message.sender_type) break
            if (!isWithinGap(previousItem.message.created_at, nextItem.message.created_at, maxGapMs)) break

            items.push(nextItem)
            cursor += 1
        }

        if (items.length < 2) continue

        const startMessageId = firstItem.message.id
        groupsByStartId.set(startMessageId, {
            startMessageId,
            senderType: firstItem.message.sender_type,
            items
        })

        for (const item of items) {
            groupedMessageIds.add(item.message.id)
        }

        index = cursor - 1
    }

    return {
        groupedMessageIds,
        groupsByStartId
    }
}
