export interface OutboundReplyButton {
    id: string
    title: string
}

export interface OutboundTextMessagePayload {
    content: string
    replyButtons?: OutboundReplyButton[]
}

export interface OutboundImageMessagePayload {
    type: 'image'
    imageUrl: string
    mimeType?: string | null
    fileName?: string | null
    caption?: string | null
}

export interface OutboundSendResult {
    providerMessageId?: string | null
    providerMetadata?: Record<string, unknown> | null
}

export type OutboundMessagePayload = OutboundTextMessagePayload | OutboundImageMessagePayload

export type OutboundMessageInput = string | OutboundMessagePayload

export function isOutboundImageMessage(input: OutboundMessageInput): input is OutboundImageMessagePayload {
    return (
        typeof input === 'object' &&
        input !== null &&
        'type' in input &&
        input.type === 'image'
    )
}

export function normalizeOutboundMessage(input: OutboundMessageInput): OutboundTextMessagePayload {
    if (typeof input === 'string') {
        return { content: input }
    }

    if (isOutboundImageMessage(input)) {
        return {
            content: input.caption ?? ''
        }
    }

    return {
        content: input.content,
        replyButtons: input.replyButtons
    }
}
