export interface OutboundReplyButton {
    id: string
    title: string
}

export interface OutboundMessagePayload {
    content: string
    replyButtons?: OutboundReplyButton[]
}

export type OutboundMessageInput = string | OutboundMessagePayload

export function normalizeOutboundMessage(input: OutboundMessageInput): OutboundMessagePayload {
    if (typeof input === 'string') {
        return { content: input }
    }

    return {
        content: input.content,
        replyButtons: input.replyButtons
    }
}
