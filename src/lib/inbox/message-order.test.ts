import { describe, expect, it } from 'vitest'
import { sortMessagesChronologically } from '@/lib/inbox/message-order'
import type { Message } from '@/types/database'

function createMessage(overrides: Partial<Message>): Message {
    return {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_type: 'contact',
        content: 'x',
        metadata: {},
        created_at: '2026-02-27T10:56:00.000Z',
        ...overrides
    }
}

describe('sortMessagesChronologically', () => {
    it('orders whatsapp contact messages by whatsapp_timestamp when created_at is delayed', () => {
        const textMessage = createMessage({
            id: 'text-1',
            content: 'test deneme metin',
            metadata: {
                whatsapp_timestamp: '1772189790'
            },
            created_at: '2026-02-27T10:56:32.944Z'
        })
        const imageMessage = createMessage({
            id: 'image-1',
            content: '[WhatsApp image]',
            metadata: {
                whatsapp_timestamp: '1772189787',
                whatsapp_message_type: 'image'
            },
            created_at: '2026-02-27T10:56:33.322Z'
        })

        const sorted = sortMessagesChronologically([textMessage, imageMessage])

        expect(sorted.map(message => message.id)).toEqual(['image-1', 'text-1'])
    })

    it('falls back to created_at ordering when whatsapp timestamp is missing', () => {
        const first = createMessage({ id: 'first', created_at: '2026-02-27T10:00:00.000Z', metadata: {} })
        const second = createMessage({ id: 'second', created_at: '2026-02-27T10:01:00.000Z', metadata: {} })

        const sorted = sortMessagesChronologically([second, first])

        expect(sorted.map(message => message.id)).toEqual(['first', 'second'])
    })

    it('parses whatsapp timestamp when metadata comes as JSON string', () => {
        const laterCreated = createMessage({
            id: 'string-meta-2',
            created_at: '2026-02-27T10:03:00.000Z',
            metadata: '{"whatsapp_timestamp":"1772189787"}' as unknown as Message['metadata']
        })
        const earlierCreated = createMessage({
            id: 'string-meta-1',
            created_at: '2026-02-27T10:02:00.000Z',
            metadata: '{"whatsapp_timestamp":"1772189790"}' as unknown as Message['metadata']
        })

        const sorted = sortMessagesChronologically([earlierCreated, laterCreated])

        expect(sorted.map(message => message.id)).toEqual(['string-meta-2', 'string-meta-1'])
    })
})
