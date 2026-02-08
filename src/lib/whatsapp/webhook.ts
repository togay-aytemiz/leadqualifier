import { createHmac, timingSafeEqual } from 'node:crypto'

export interface WhatsAppTextMessageEvent {
    phoneNumberId: string
    contactPhone: string
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

export function extractWhatsAppTextMessages(payload: unknown): WhatsAppTextMessageEvent[] {
    if (!isRecord(payload) || !Array.isArray(payload.entry)) return []

    const events: WhatsAppTextMessageEvent[] = []

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
                const textNode = isRecord(message.text) ? message.text : null
                const text = textNode ? asString(textNode.body) : null

                if (messageType !== 'text' || !from || !messageId || !text) continue

                events.push({
                    phoneNumberId,
                    contactPhone: from,
                    contactName: contactNames.get(from) ?? null,
                    messageId,
                    text,
                    timestamp
                })
            }
        }
    }

    return events
}
