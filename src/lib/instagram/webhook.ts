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
    skipAutomation: boolean
    media?: {
        type: 'image'
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

function extractInstagramImageAttachment(attachments: unknown[]) {
    for (const attachment of attachments) {
        if (!isRecord(attachment)) continue
        if (asString(attachment.type) !== 'image') continue

        const payload = isRecord(attachment.payload) ? attachment.payload : null
        const url = payload ? asString(payload.url) : null
        const mimeType = payload ? asString(payload.mime_type) : null

        return {
            type: 'image' as const,
            url,
            mimeType
        }
    }

    return null
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

        const contactId = sender ? asString(sender.id) : null
        const recipientId = recipient ? asString(recipient.id) : null
        const contactName = sender
            ? asString(sender.username) || asString(sender.name)
            : null

        if (!contactId) continue
        if (contactId === entryId) continue
        if (!recipientId && !isRecord(item.postback) && !isRecord(item.referral) && !isRecord(item.reaction)) continue

        const timestampRaw = item.timestamp
        const timestamp = typeof timestampRaw === 'number'
            ? String(timestampRaw)
            : asString(timestampRaw)

        const message = isRecord(item.message) ? item.message : null
        if (message && message.is_echo !== true) {
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
            const imageAttachment = extractInstagramImageAttachment(attachments)

            if (imageAttachment) {
                const caption = text
                events.push({
                    instagramBusinessAccountId: entryId,
                    contactId,
                    contactName,
                    messageId,
                    text: caption || '[Instagram image]',
                    timestamp,
                    eventSource,
                    eventType: 'attachment',
                    skipAutomation: !caption,
                    media: {
                        ...imageAttachment,
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
                    skipAutomation: false
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
                const attachmentLabel = attachmentTypes.length > 0
                    ? `[Instagram attachment: ${attachmentTypes.join(', ')}]`
                    : '[Instagram attachment]'

                events.push({
                    instagramBusinessAccountId: entryId,
                    contactId,
                    contactName,
                    messageId,
                    text: attachmentLabel,
                    timestamp,
                    eventSource,
                    eventType: 'attachment',
                    skipAutomation: true
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
