import { describe, expect, it } from 'vitest'
import type { Message } from '@/types/database'
import { buildInboxImageGalleryLookup } from './message-image-groups'

function createMessage(
    id: string,
    overrides?: Partial<Message>
): Message {
    return {
        id,
        conversation_id: 'conv-1',
        sender_type: 'contact',
        content: '[WhatsApp image]',
        metadata: {
            whatsapp_media: {
                type: 'image',
                storage_url: `https://cdn.example.com/${id}.jpg`
            },
            whatsapp_is_media_placeholder: true
        },
        created_at: '2026-02-27T10:56:00.000Z',
        ...overrides
    }
}

describe('buildInboxImageGalleryLookup', () => {
    it('groups consecutive image-only messages from same sender', () => {
        const messages = [
            createMessage('m1', { created_at: '2026-02-27T10:56:00.000Z' }),
            createMessage('m2', { created_at: '2026-02-27T10:56:12.000Z' }),
            createMessage('m3', { created_at: '2026-02-27T10:56:28.000Z' })
        ]

        const lookup = buildInboxImageGalleryLookup(messages)
        const group = lookup.groupsByStartId.get('m1')

        expect(group).toBeTruthy()
        expect(group?.items.map((item) => item.message.id)).toEqual(['m1', 'm2', 'm3'])
        expect(lookup.groupedMessageIds.has('m1')).toBe(true)
        expect(lookup.groupedMessageIds.has('m2')).toBe(true)
        expect(lookup.groupedMessageIds.has('m3')).toBe(true)
    })

    it('does not group messages when text message breaks sequence', () => {
        const messages = [
            createMessage('m1', { created_at: '2026-02-27T10:56:00.000Z' }),
            createMessage('m2', {
                created_at: '2026-02-27T10:56:12.000Z',
                content: 'merhaba',
                metadata: {}
            }),
            createMessage('m3', { created_at: '2026-02-27T10:56:20.000Z' })
        ]

        const lookup = buildInboxImageGalleryLookup(messages)

        expect(lookup.groupsByStartId.size).toBe(0)
        expect(lookup.groupedMessageIds.size).toBe(0)
    })

    it('does not group image messages when they are outside allowed gap', () => {
        const messages = [
            createMessage('m1', { created_at: '2026-02-27T10:56:00.000Z' }),
            createMessage('m2', { created_at: '2026-02-27T11:03:00.000Z' })
        ]

        const lookup = buildInboxImageGalleryLookup(messages)

        expect(lookup.groupsByStartId.size).toBe(0)
    })

    it('does not include captioned image messages in galleries', () => {
        const messages = [
            createMessage('m1', {
                content: 'deneme caption',
                metadata: {
                    whatsapp_media: {
                        type: 'image',
                        storage_url: 'https://cdn.example.com/m1.jpg',
                        caption: 'deneme caption'
                    },
                    whatsapp_is_media_placeholder: true
                }
            }),
            createMessage('m2', { created_at: '2026-02-27T10:56:12.000Z' }),
            createMessage('m3', { created_at: '2026-02-27T10:56:25.000Z' })
        ]

        const lookup = buildInboxImageGalleryLookup(messages)
        const group = lookup.groupsByStartId.get('m2')

        expect(group).toBeTruthy()
        expect(group?.items.map((item) => item.message.id)).toEqual(['m2', 'm3'])
        expect(lookup.groupedMessageIds.has('m1')).toBe(false)
    })
})
