import { createHmac, timingSafeEqual } from 'node:crypto'

export interface WhatsAppTextMessageEvent {
    kind: 'text'
    phoneNumberId: string
    contactPhone: string
    contactName: string | null
    messageId: string
    text: string
    timestamp: string | null
}

export type WhatsAppMediaType = 'image' | 'document' | 'audio' | 'video' | 'sticker' | 'unknown'

export interface WhatsAppMediaMessageEvent {
    kind: 'media'
    phoneNumberId: string
    contactPhone: string
    contactName: string | null
    messageId: string
    mediaType: WhatsAppMediaType
    mediaId: string
    mimeType: string | null
    sha256: string | null
    caption: string | null
    filename: string | null
    timestamp: string | null
}

export type WhatsAppInboundMessageEvent = WhatsAppTextMessageEvent | WhatsAppMediaMessageEvent

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asString(value: unknown): string | null {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
}

function buildContactNameMap(value: Record<string, unknown>): Map<string, string> {
    const contacts = value.contacts
    const map = new Map<string, string>()
    if (!Array.isArray(contacts)) return map

    for (const contact of contacts) {
        if (!isRecord(contact)) continue
        const waId = asString(contact.wa_id)
        const profile = isRecord(contact.profile) ? contact.profile : null
        const name = profile ? asString(profile.name) : null
        if (!waId || !name) continue
        map.set(waId, name)
    }

    return map
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

function resolveMediaType(messageType: string | null): WhatsAppMediaType | null {
    if (messageType === 'image') return 'image'
    if (messageType === 'document') return 'document'
    if (messageType === 'audio') return 'audio'
    if (messageType === 'video') return 'video'
    if (messageType === 'sticker') return 'sticker'
    if (messageType === 'unknown') return 'unknown'
    return null
}

function readMediaNode(message: Record<string, unknown>, mediaType: WhatsAppMediaType) {
    const mediaNodeValue = message[mediaType]
    const mediaNode = isRecord(mediaNodeValue) ? mediaNodeValue : null
    if (!mediaNode) return null

    const mediaId = asString(mediaNode.id)
    if (!mediaId) return null

    const mimeType = asString(mediaNode.mime_type)
    const sha256 = asString(mediaNode.sha256)
    const caption = asString(mediaNode.caption)
    const filename = asString(mediaNode.filename)

    return {
        mediaId,
        mimeType,
        sha256,
        caption,
        filename
    }
}

export function extractWhatsAppInboundMessages(payload: unknown): WhatsAppInboundMessageEvent[] {
    if (!isRecord(payload) || !Array.isArray(payload.entry)) return []

    const events: WhatsAppInboundMessageEvent[] = []

    for (const entry of payload.entry) {
        if (!isRecord(entry) || !Array.isArray(entry.changes)) continue

        for (const change of entry.changes) {
            if (!isRecord(change) || !isRecord(change.value)) continue
            const value = change.value
            const metadata = isRecord(value.metadata) ? value.metadata : null
            const phoneNumberId = metadata ? asString(metadata.phone_number_id) : null
            const contactNames = buildContactNameMap(value)
            const messages = value.messages

            if (!phoneNumberId || !Array.isArray(messages)) continue

            for (const message of messages) {
                if (!isRecord(message)) continue
                const messageType = asString(message.type)
                const from = asString(message.from)
                const messageId = asString(message.id)
                const timestamp = asString(message.timestamp)

                if (!from || !messageId) continue

                if (messageType === 'text') {
                    const textNode = isRecord(message.text) ? message.text : null
                    const text = textNode ? asString(textNode.body) : null
                    if (!text) continue

                    events.push({
                        kind: 'text',
                        phoneNumberId,
                        contactPhone: from,
                        contactName: contactNames.get(from) ?? null,
                        messageId,
                        text,
                        timestamp
                    })
                    continue
                }

                const mediaType = resolveMediaType(messageType)
                if (!mediaType) continue

                const media = readMediaNode(message, mediaType)
                if (!media) continue

                events.push({
                    kind: 'media',
                    phoneNumberId,
                    contactPhone: from,
                    contactName: contactNames.get(from) ?? null,
                    messageId,
                    mediaType,
                    mediaId: media.mediaId,
                    mimeType: media.mimeType,
                    sha256: media.sha256,
                    caption: media.caption,
                    filename: media.filename,
                    timestamp
                })
            }
        }
    }

    return events
}

export function extractWhatsAppTextMessages(payload: unknown): Omit<WhatsAppTextMessageEvent, 'kind'>[] {
    return extractWhatsAppInboundMessages(payload)
        .filter((event): event is WhatsAppTextMessageEvent => event.kind === 'text')
        .map((event) => ({
            phoneNumberId: event.phoneNumberId,
            contactPhone: event.contactPhone,
            contactName: event.contactName,
            messageId: event.messageId,
            text: event.text,
            timestamp: event.timestamp
        }))
}
