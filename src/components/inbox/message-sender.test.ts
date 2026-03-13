import { describe, expect, it } from 'vitest'
import { resolveMessageSenderIdentity } from './message-sender'
import type { Message } from '@/types/database'

function createMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_type: 'user',
        content: 'Merhaba',
        metadata: {},
        created_at: '2026-03-13T12:00:00.000Z',
        ...overrides
    }
}

describe('resolveMessageSenderIdentity', () => {
    it('uses current user avatar and localized footer label for own outbound messages', () => {
        const identity = resolveMessageSenderIdentity({
            message: createMessage({ created_by: 'user-1' }),
            currentUserId: 'user-1',
            currentUserProfile: {
                id: 'user-1',
                full_name: 'Togay Yilmaz',
                email: 'togay@example.com',
                avatar_url: 'https://cdn.example.com/togay.webp'
            },
            senderProfilesById: {},
            contactName: 'Ayse Demir',
            contactAvatarUrl: null,
            youLabel: 'You',
            botName: 'Kualia'
        })

        expect(identity.kind).toBe('user')
        expect(identity.avatarUrl).toBe('https://cdn.example.com/togay.webp')
        expect(identity.footerLabel).toBe('You')
        expect(identity.displayName).toBe('Togay Yilmaz')
    })

    it('uses the sending operator profile for messages from another user', () => {
        const identity = resolveMessageSenderIdentity({
            message: createMessage({ created_by: 'user-2' }),
            currentUserId: 'user-1',
            currentUserProfile: {
                id: 'user-1',
                full_name: 'Togay Yilmaz',
                email: 'togay@example.com',
                avatar_url: 'https://cdn.example.com/togay.webp'
            },
            senderProfilesById: {
                'user-2': {
                    id: 'user-2',
                    full_name: 'Operator Two',
                    email: 'operator2@example.com',
                    avatar_url: 'https://cdn.example.com/operator-two.webp'
                }
            },
            contactName: 'Ayse Demir',
            contactAvatarUrl: null,
            youLabel: 'You',
            botName: 'Kualia'
        })

        expect(identity.kind).toBe('user')
        expect(identity.avatarUrl).toBe('https://cdn.example.com/operator-two.webp')
        expect(identity.footerLabel).toBe('Operator Two')
    })

    it('falls back to contact identity for inbound customer messages', () => {
        const identity = resolveMessageSenderIdentity({
            message: createMessage({ sender_type: 'contact', created_by: null }),
            currentUserId: 'user-1',
            currentUserProfile: null,
            senderProfilesById: {},
            contactName: 'Ayse Demir',
            contactAvatarUrl: 'https://cdn.example.com/contact.webp',
            youLabel: 'You',
            botName: 'Kualia'
        })

        expect(identity.kind).toBe('contact')
        expect(identity.avatarUrl).toBe('https://cdn.example.com/contact.webp')
        expect(identity.displayName).toBe('Ayse Demir')
    })

    it('returns a branded bot identity for bot messages', () => {
        const identity = resolveMessageSenderIdentity({
            message: createMessage({ sender_type: 'bot', created_by: null }),
            currentUserId: 'user-1',
            currentUserProfile: null,
            senderProfilesById: {},
            contactName: 'Ayse Demir',
            contactAvatarUrl: null,
            youLabel: 'You',
            botName: 'Kualia'
        })

        expect(identity.kind).toBe('bot')
        expect(identity.displayName).toBe('Kualia')
        expect(identity.footerLabel).toBe('Kualia')
    })
})
