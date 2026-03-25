import { createHmac, timingSafeEqual } from 'node:crypto'

export type InstagramInboundEventType =
    | 'message'
    | 'attachment'
    | 'postback'
    | 'referral'
    | 'reaction'
    | 'seen'
    | 'optin'
    | 'handover'
    | 'message_deleted'

export interface InstagramInboundEvent {
    instagramBusinessAccountId: string
    contactId: string
    contactName: string | null
    messageId: string
    text: string
    timestamp: string | null
    eventSource: 'messaging' | 'standby'
    eventType: InstagramInboundEventType
    direction: 'inbound' | 'outbound'
    skipAutomation: boolean
    debugMessage?: Record<string, unknown> | null
    media?: {
        type: 'image' | 'unknown'
        originalType?: string | null
        previewKind?: 'image' | 'link'
        url: string | null
        mimeType: string | null
        caption: string | null
    }
}

const CHANGE_MESSAGING_FIELDS = new Set([
    'messages',
    'standby',
    'messaging_postbacks',
    'messaging_referral',
    'messaging_seen',
    'message_reactions',
    'messaging_optins',
    'messaging_handover',
    'message_edit'
])

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function isHttpUrl(value: unknown) {
    const normalized = asString(value)
    if (!normalized) return null
    if (!/^https?:\/\//i.test(normalized)) return null
    return normalized
}

function looksLikeImageUrl(url: string) {
    const normalized = url.toLowerCase()
    return /\.(avif|gif|jpe?g|png|webp)(?:[?#].*)?$/.test(normalized)
        || normalized.includes('cdninstagram.com/')
        || normalized.includes('scontent-')
}

function resolveInstagramPreviewKind(params: {
    originalType: string | null
    url: string | null
    mimeType: string | null
}) {
    if (params.mimeType?.startsWith('image/')) return 'image' as const

    const normalizedType = params.originalType?.trim().toLowerCase() ?? null
    if (normalizedType === 'image') return 'image' as const
    if (normalizedType === 'reply_to_story') return 'image' as const
    if (normalizedType === 'ig_story') return 'image' as const
    if (normalizedType === 'story_mention') return 'image' as const
    if (params.url && looksLikeImageUrl(params.url)) return 'image' as const

    return 'link' as const
}

function buildInstagramAttachmentMedia(params: {
    originalType: string | null
    url: string | null
    mimeType: string | null
}) {
    if (!params.url) return null
    const previewKind = resolveInstagramPreviewKind(params)
    const includeExtendedPreviewMetadata = params.originalType !== 'image'

    return {
        type: params.originalType === 'image' ? 'image' as const : 'unknown' as const,
        url: params.url,
        mimeType: params.mimeType,
        ...(includeExtendedPreviewMetadata
            ? {
                originalType: params.originalType,
                previewKind
            }
            : {})
    }
}

function extractInstagramAttachmentMedia(attachments: unknown[]) {
    for (const attachment of attachments) {
        if (!isRecord(attachment)) continue

        const originalType = asString(attachment.type)
        const payload = isRecord(attachment.payload) ? attachment.payload : null
        const url = payload
            ? isHttpUrl(payload.url) || isHttpUrl(payload.file_url)
            : null
        const mimeType = payload ? asString(payload.mime_type) : null
        const media = buildInstagramAttachmentMedia({
            originalType,
            url,
            mimeType
        })

        if (media) return media
    }

    return null
}

function extractInstagramReplyToStoryMedia(message: Record<string, unknown>) {
    const replyTo = isRecord(message.reply_to) ? message.reply_to : null
    const story = replyTo && isRecord(replyTo.story) ? replyTo.story : null
    const url = story ? isHttpUrl(story.url) : null

    return buildInstagramAttachmentMedia({
        originalType: 'reply_to_story',
        url,
        mimeType: null
    })
}

function buildInstagramAttachmentLabel(attachmentTypes: string[]) {
    const normalizedTypes = attachmentTypes.filter(Boolean)
    if (normalizedTypes.length === 0) return '[Instagram attachment]'
    return `[Instagram attachment: ${normalizedTypes.join(', ')}]`
}

function cloneDebugValue(value: unknown): unknown {
    if (value === null) return null
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return value
    }

    if (Array.isArray(value)) {
        return value.map((item) => cloneDebugValue(item))
    }

    if (isRecord(value)) {
        const cloned: Record<string, unknown> = {}
        for (const [key, nestedValue] of Object.entries(value)) {
            const nextValue = cloneDebugValue(nestedValue)
            if (typeof nextValue === 'undefined') continue
            cloned[key] = nextValue
        }
        return cloned
    }

    return undefined
}

function buildInstagramMessageDebugSnapshot(message: Record<string, unknown>) {
    const snapshot: Record<string, unknown> = {}
    let hasDebugSignal = false

    if (typeof message.is_unsupported === 'boolean') {
        snapshot.is_unsupported = message.is_unsupported
        hasDebugSignal = hasDebugSignal || message.is_unsupported
    }

    if (Array.isArray(message.attachments)) {
        snapshot.attachments = cloneDebugValue(message.attachments)
        hasDebugSignal = true
    }

    if (isRecord(message.reply_to)) {
        snapshot.reply_to = cloneDebugValue(message.reply_to)
        hasDebugSignal = true
    }

    if (!hasDebugSignal) return null

    const mid = asString(message.mid)
    if (mid) snapshot.mid = mid

    return snapshot
}

function buildSyntheticMessageId(params: {
    entryId: string
    contactId: string
    eventSource: 'messaging' | 'standby'
    eventType: InstagramInboundEventType
    timestamp: string | null
    index: number
}) {
    const safeTimestamp = params.timestamp ?? '0'
    return `igevt:${params.eventSource}:${params.eventType}:${params.entryId}:${params.contactId}:${safeTimestamp}:${params.index}`
}

function extractInboundEventsFromItems(
    entryId: string,
    items: unknown[],
    events: InstagramInboundEvent[],
    eventSource: 'messaging' | 'standby'
) {
    for (const [index, item] of items.entries()) {
        if (!isRecord(item)) continue

        const sender = isRecord(item.sender) ? item.sender : null
        const recipient = isRecord(item.recipient) ? item.recipient : null
        const recipientId = recipient ? asString(recipient.id) : null

        const timestampRaw = item.timestamp
        const timestamp = typeof timestampRaw === 'number'
            ? String(timestampRaw)
            : asString(timestampRaw)

        const message = isRecord(item.message) ? item.message : null
        const direction = message?.is_echo === true ? 'outbound' : 'inbound'
        const contactActor = direction === 'outbound' ? recipient : sender
        const contactId = contactActor ? asString(contactActor.id) : null
        const contactName = contactActor
            ? asString(contactActor.username) || asString(contactActor.name)
            : null

        if (!contactId) continue
        if (contactId === entryId) continue
        if (!recipientId && !isRecord(item.postback) && !isRecord(item.referral) && !isRecord(item.reaction)) continue

        if (message) {
            const messageId = asString(message.mid) || buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'message',
                timestamp,
                index
            })
            const text = asString(message.text)
            const attachments = Array.isArray(message.attachments) ? message.attachments : []
            const debugMessage = buildInstagramMessageDebugSnapshot(message)
            const attachmentMedia = extractInstagramAttachmentMedia(attachments)
                || extractInstagramReplyToStoryMedia(message)

            if (attachmentMedia) {
                const caption = text
                const fallbackText = attachmentMedia.type === 'image'
                    ? '[Instagram image]'
                    : buildInstagramAttachmentLabel([
                        attachmentMedia.originalType ?? attachmentMedia.type
                    ])
                events.push({
                    instagramBusinessAccountId: entryId,
                    contactId,
                    contactName,
                    messageId,
                    text: caption || fallbackText,
                    timestamp,
                    eventSource,
                    eventType: 'attachment',
                    direction,
                    skipAutomation: direction === 'outbound' || !caption,
                    media: {
                        ...attachmentMedia,
                        caption
                    }
                })
                continue
            }

            if (text) {
                events.push({
                    instagramBusinessAccountId: entryId,
                    contactId,
                    contactName,
                    messageId,
                    text,
                    timestamp,
                    eventSource,
                    eventType: 'message',
                    direction,
                    skipAutomation: direction === 'outbound'
                })
                continue
            }

            if (attachments.length > 0) {
                const attachmentTypes = attachments
                    .map((attachment) => {
                        if (!isRecord(attachment)) return null
                        return asString(attachment.type)
                    })
                    .filter((value): value is string => Boolean(value))
                const attachmentLabel = buildInstagramAttachmentLabel(attachmentTypes)

                events.push({
                    instagramBusinessAccountId: entryId,
                    contactId,
                    contactName,
                    messageId,
                    text: attachmentLabel,
                    timestamp,
                    eventSource,
                    eventType: 'attachment',
                    direction,
                    skipAutomation: true,
                    debugMessage
                })
                continue
            }

            if (message.is_deleted === true) {
                events.push({
                    instagramBusinessAccountId: entryId,
                    contactId,
                    contactName,
                    messageId,
                    text: '[Instagram message deleted]',
                    timestamp,
                    eventSource,
                    eventType: 'message_deleted',
                    direction,
                    skipAutomation: true
                })
                continue
            }
        }

        const postback = isRecord(item.postback) ? item.postback : null
        if (postback) {
            const messageId = asString(postback.mid) || buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'postback',
                timestamp,
                index
            })
            const payload = asString(postback.payload)
            const title = asString(postback.title)
            const postbackText = payload
                ? `[Instagram postback] ${payload}`
                : title
                    ? `[Instagram postback] ${title}`
                    : '[Instagram postback]'

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName,
                messageId,
                text: postbackText,
                timestamp,
                eventSource,
                eventType: 'postback',
                direction: 'inbound',
                skipAutomation: true
            })
            continue
        }

        const referral = isRecord(item.referral) ? item.referral : null
        if (referral) {
            const source = asString(referral.source)
            const messageId = buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'referral',
                timestamp,
                index
            })

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName,
                messageId,
                text: source ? `[Instagram referral] ${source}` : '[Instagram referral]',
                timestamp,
                eventSource,
                eventType: 'referral',
                direction: 'inbound',
                skipAutomation: true
            })
            continue
        }

        const reaction = isRecord(item.reaction) ? item.reaction : null
        if (reaction) {
            const messageId = buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'reaction',
                timestamp,
                index
            })
            const emoji = asString(reaction.emoji)
            const action = asString(reaction.action)
            const reactionLabel = [action, emoji].filter(Boolean).join(' ')

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName,
                messageId,
                text: reactionLabel ? `[Instagram reaction] ${reactionLabel}` : '[Instagram reaction]',
                timestamp,
                eventSource,
                eventType: 'reaction',
                direction: 'inbound',
                skipAutomation: true
            })
            continue
        }

        if (isRecord(item.read)) {
            const messageId = buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'seen',
                timestamp,
                index
            })

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName,
                messageId,
                text: '[Instagram seen]',
                timestamp,
                eventSource,
                eventType: 'seen',
                direction: 'inbound',
                skipAutomation: true
            })
            continue
        }

        if (isRecord(item.optin)) {
            const messageId = buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'optin',
                timestamp,
                index
            })

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName,
                messageId,
                text: '[Instagram opt-in]',
                timestamp,
                eventSource,
                eventType: 'optin',
                direction: 'inbound',
                skipAutomation: true
            })
            continue
        }

        const hasHandover =
            isRecord(item.pass_thread_control)
            || isRecord(item.take_thread_control)
            || isRecord(item.request_thread_control)

        if (hasHandover) {
            const messageId = buildSyntheticMessageId({
                entryId,
                contactId,
                eventSource,
                eventType: 'handover',
                timestamp,
                index
            })

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName,
                messageId,
                text: '[Instagram handover event]',
                timestamp,
                eventSource,
                eventType: 'handover',
                direction: 'inbound',
                skipAutomation: true
            })
        }
    }
}

function collectEntryItems(
    entry: Record<string, unknown>
): Array<{ eventSource: 'messaging' | 'standby'; item: unknown }> {
    const aggregated: Array<{ eventSource: 'messaging' | 'standby'; item: unknown }> = []

    const messaging = Array.isArray(entry.messaging) ? entry.messaging : []
    const standby = Array.isArray(entry.standby) ? entry.standby : []

    for (const item of messaging) {
        aggregated.push({ eventSource: 'messaging', item })
    }
    for (const item of standby) {
        aggregated.push({ eventSource: 'standby', item })
    }

    const changes = Array.isArray(entry.changes) ? entry.changes : []
    for (const change of changes) {
        if (!isRecord(change)) continue
        const field = asString(change.field)
        if (!field || !CHANGE_MESSAGING_FIELDS.has(field)) continue

        const eventSource = field === 'standby' ? 'standby' : 'messaging'
        const value = change.value
        if (Array.isArray(value)) {
            for (const item of value) {
                aggregated.push({ eventSource, item })
            }
            continue
        }

        if (isRecord(value)) {
            const nestedMessaging = Array.isArray(value.messaging) ? value.messaging : []
            const nestedStandby = Array.isArray(value.standby) ? value.standby : []

            if (nestedMessaging.length > 0 || nestedStandby.length > 0) {
                for (const item of nestedMessaging) {
                    aggregated.push({ eventSource: 'messaging', item })
                }
                for (const item of nestedStandby) {
                    aggregated.push({ eventSource: 'standby', item })
                }
                continue
            }

            aggregated.push({ eventSource, item: value })
        }
    }

    return aggregated
}

export function buildMetaSignature(rawBody: string, appSecret: string) {
    const digest = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
    return `sha256=${digest}`
}

export function isValidMetaSignature(signatureHeader: string | null, rawBody: string, appSecret: string | null) {
    const received = asString(signatureHeader)
    const secret = asString(appSecret)
    if (!received || !secret || !received.startsWith('sha256=')) return false

    const expected = buildMetaSignature(rawBody, secret)
    const expectedBuffer = Buffer.from(expected, 'utf8')
    const receivedBuffer = Buffer.from(received, 'utf8')
    if (expectedBuffer.length !== receivedBuffer.length) return false

    return timingSafeEqual(expectedBuffer, receivedBuffer)
}

export function extractInstagramInboundEvents(payload: unknown): InstagramInboundEvent[] {
    if (!isRecord(payload) || !Array.isArray(payload.entry)) return []

    const events: InstagramInboundEvent[] = []

    for (const entry of payload.entry) {
        if (!isRecord(entry)) continue
        const entryId = asString(entry.id)
        if (!entryId) continue

        const collected = collectEntryItems(entry)
        const messaging = collected
            .filter((candidate) => candidate.eventSource === 'messaging')
            .map((candidate) => candidate.item)
        const standby = collected
            .filter((candidate) => candidate.eventSource === 'standby')
            .map((candidate) => candidate.item)

        extractInboundEventsFromItems(entryId, messaging, events, 'messaging')
        extractInboundEventsFromItems(entryId, standby, events, 'standby')
    }

    return events
}

// Backward-compatible export name retained for existing imports/tests.
export const extractInstagramTextMessages = extractInstagramInboundEvents
