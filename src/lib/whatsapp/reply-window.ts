const WHATSAPP_REPLY_WINDOW_HOURS = 24
const WHATSAPP_REPLY_WINDOW_MS = WHATSAPP_REPLY_WINDOW_HOURS * 60 * 60 * 1000

export type WhatsAppReplyWindowReason = 'within_window' | 'window_expired' | 'missing_inbound'

export interface WhatsAppReplyWindowState {
    canReply: boolean
    reason: WhatsAppReplyWindowReason
    latestInboundAt: string | null
    windowClosesAt: string | null
}

export interface ReplyWindowMessageLike {
    sender_type?: string | null
    created_at?: string | null
}

type DateLike = string | Date | null | undefined

function toValidDate(value: DateLike): Date | null {
    if (!value) return null
    const parsed = value instanceof Date ? value : new Date(value)
    return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function getLatestContactMessageAt(messages: ReplyWindowMessageLike[]): string | null {
    let latestContactAt: Date | null = null

    for (const message of messages) {
        if (message.sender_type !== 'contact') continue
        const parsedDate = toValidDate(message.created_at)
        if (!parsedDate) continue
        if (!latestContactAt || parsedDate.getTime() > latestContactAt.getTime()) {
            latestContactAt = parsedDate
        }
    }

    return latestContactAt ? latestContactAt.toISOString() : null
}

export function resolveWhatsAppReplyWindowState(options: {
    latestInboundAt: DateLike
    now?: Date
}): WhatsAppReplyWindowState {
    const latestInboundAt = toValidDate(options.latestInboundAt)

    if (!latestInboundAt) {
        return {
            canReply: false,
            reason: 'missing_inbound',
            latestInboundAt: null,
            windowClosesAt: null
        }
    }

    const now = options.now ?? new Date()
    const nowMs = Number.isNaN(now.getTime()) ? Date.now() : now.getTime()
    const windowClosesAt = new Date(latestInboundAt.getTime() + WHATSAPP_REPLY_WINDOW_MS)
    const canReply = nowMs <= windowClosesAt.getTime()

    return {
        canReply,
        reason: canReply ? 'within_window' : 'window_expired',
        latestInboundAt: latestInboundAt.toISOString(),
        windowClosesAt: windowClosesAt.toISOString()
    }
}

