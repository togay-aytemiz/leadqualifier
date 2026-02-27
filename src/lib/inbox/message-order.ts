import type { Message } from '@/types/database'

function toValidDate(value: string | null | undefined): Date | null {
    if (!value) return null
    const parsed = new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        return value as Record<string, unknown>
    }

    if (typeof value === 'string') {
        const trimmed = value.trim()
        if (!trimmed) return null

        try {
            const parsed = JSON.parse(trimmed)
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
                return parsed as Record<string, unknown>
            }
        } catch {
            return null
        }
    }

    return null
}

function resolveWhatsAppTimestampMs(metadata: unknown): number | null {
    const record = toRecord(metadata)
    if (!record) return null

    const value = record.whatsapp_timestamp
    let parsed: number | null = null

    if (typeof value === 'number' && Number.isFinite(value)) {
        parsed = value
    } else if (typeof value === 'string') {
        const numeric = Number.parseFloat(value.trim())
        if (Number.isFinite(numeric)) parsed = numeric
    }

    if (parsed === null) return null

    // WhatsApp timestamps are usually epoch seconds.
    if (parsed > 0 && parsed < 1_000_000_000_000) {
        return Math.trunc(parsed * 1000)
    }

    return Math.trunc(parsed)
}

function resolveCreatedAtMs(message: Pick<Message, 'created_at'>) {
    const createdAt = toValidDate(message.created_at)
    return createdAt ? createdAt.getTime() : 0
}

function resolveMessageOrderMs(message: Pick<Message, 'created_at' | 'metadata'>) {
    return resolveWhatsAppTimestampMs(message.metadata) ?? resolveCreatedAtMs(message)
}

export function sortMessagesChronologically(messages: Message[]) {
    return [...messages].sort((a, b) => {
        const orderA = resolveMessageOrderMs(a)
        const orderB = resolveMessageOrderMs(b)

        if (orderA !== orderB) return orderA - orderB

        const createdA = resolveCreatedAtMs(a)
        const createdB = resolveCreatedAtMs(b)
        if (createdA !== createdB) return createdA - createdB

        return a.id.localeCompare(b.id)
    })
}
