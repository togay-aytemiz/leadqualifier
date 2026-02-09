import { createHmac, timingSafeEqual } from 'node:crypto'

export interface InstagramTextMessageEvent {
    instagramBusinessAccountId: string
    contactId: string
    contactName: string | null
    messageId: string
    text: string
    timestamp: string | null
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
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

export function extractInstagramTextMessages(payload: unknown): InstagramTextMessageEvent[] {
    if (!isRecord(payload) || !Array.isArray(payload.entry)) return []

    const events: InstagramTextMessageEvent[] = []

    for (const entry of payload.entry) {
        if (!isRecord(entry)) continue
        const entryId = asString(entry.id)
        const messaging = entry.messaging
        if (!entryId || !Array.isArray(messaging)) continue

        for (const item of messaging) {
            if (!isRecord(item)) continue

            const sender = isRecord(item.sender) ? item.sender : null
            const recipient = isRecord(item.recipient) ? item.recipient : null
            const message = isRecord(item.message) ? item.message : null

            const contactId = sender ? asString(sender.id) : null
            const recipientId = recipient ? asString(recipient.id) : null
            const messageId = message ? asString(message.mid) : null
            const text = message ? asString(message.text) : null
            const isEcho = message?.is_echo === true

            if (!contactId || !recipientId || !messageId || !text || isEcho) continue
            if (recipientId !== entryId) continue

            const timestampRaw = item.timestamp
            const timestamp = typeof timestampRaw === 'number'
                ? String(timestampRaw)
                : asString(timestampRaw)

            events.push({
                instagramBusinessAccountId: entryId,
                contactId,
                contactName: null,
                messageId,
                text,
                timestamp
            })
        }
    }

    return events
}
