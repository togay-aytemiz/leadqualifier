import { describe, expect, it } from 'vitest'

import {
    isInstagramSeenEventMessage,
    resolveInstagramMessageEventType,
    resolveLatestNonSeenPreviewMessage
} from './instagramMessageEvents'

describe('instagramMessageEvents helpers', () => {
    it('resolves instagram event type from metadata', () => {
        expect(resolveInstagramMessageEventType({ instagram_event_type: 'seen' })).toBe('seen')
        expect(resolveInstagramMessageEventType('{"instagram_event_type":"Message"}')).toBe('message')
        expect(resolveInstagramMessageEventType({ instagram_event_type: '' })).toBeNull()
    })

    it('detects instagram seen events using metadata', () => {
        expect(isInstagramSeenEventMessage({
            platform: 'instagram',
            senderType: 'contact',
            metadata: { instagram_event_type: 'seen' }
        })).toBe(true)
    })

    it('detects legacy instagram seen payloads by content fallback', () => {
        expect(isInstagramSeenEventMessage({
            platform: 'instagram',
            senderType: 'contact',
            metadata: {},
            content: '[Instagram seen]'
        })).toBe(true)
    })

    it('does not mark non-seen or non-instagram messages as seen events', () => {
        expect(isInstagramSeenEventMessage({
            platform: 'instagram',
            senderType: 'contact',
            metadata: { instagram_event_type: 'message' },
            content: '[Instagram seen]'
        })).toBe(false)

        expect(isInstagramSeenEventMessage({
            platform: 'whatsapp',
            senderType: 'contact',
            metadata: { instagram_event_type: 'seen' }
        })).toBe(false)

        expect(isInstagramSeenEventMessage({
            platform: 'instagram',
            senderType: 'user',
            metadata: { instagram_event_type: 'seen' }
        })).toBe(false)
    })

    it('resolves latest preview message by skipping instagram seen events', () => {
        expect(resolveLatestNonSeenPreviewMessage('instagram', [
            {
                sender_type: 'contact',
                content: '[Instagram seen]',
                metadata: { instagram_event_type: 'seen' }
            },
            {
                sender_type: 'contact',
                content: 'Merhaba',
                metadata: { instagram_event_type: 'message' }
            }
        ])).toMatchObject({ content: 'Merhaba' })

        expect(resolveLatestNonSeenPreviewMessage('instagram', [
            {
                sender_type: 'contact',
                content: '[Instagram seen]',
                metadata: { instagram_event_type: 'seen' }
            }
        ])).toBeNull()
    })
})
