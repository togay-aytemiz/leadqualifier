import { describe, expect, it } from 'vitest'

import type { Message } from '@/types/database'
import type { ConversationListItem } from '@/lib/inbox/actions'
import {
    isInstagramRequestConversation,
    resolveInboxContactDisplayName,
    resolveInstagramEventSource
} from './instagramRequestState'

function buildConversation(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
    return {
        id: 'conv-1',
        organization_id: 'org-1',
        contact_name: '1400879865404973',
        contact_phone: '1400879865404973',
        platform: 'instagram',
        status: 'open',
        assignee_id: null,
        active_agent: 'bot',
        ai_processing_paused: false,
        unread_count: 1,
        last_message_at: '2026-03-10T12:45:00.000Z',
        tags: [],
        created_at: '2026-03-10T12:45:00.000Z',
        updated_at: '2026-03-10T12:45:00.000Z',
        ...overrides
    }
}

function buildMessage(overrides: Partial<Message> = {}): Message {
    return {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_type: 'contact',
        content: 'Merhaba',
        metadata: {},
        created_at: '2026-03-10T12:45:00.000Z',
        ...overrides
    }
}

describe('instagramRequestState helpers', () => {
    it('resolves instagram event source from metadata payload', () => {
        expect(resolveInstagramEventSource({ instagram_event_source: 'standby' })).toBe('standby')
        expect(resolveInstagramEventSource({ instagram_event_source: 'messaging' })).toBe('messaging')
        expect(resolveInstagramEventSource({ instagram_event_source: 'unknown' })).toBeNull()
    })

    it('treats instagram_request tag as request-origin conversation', () => {
        const conversation = buildConversation({
            tags: ['instagram_request']
        })

        expect(isInstagramRequestConversation(conversation)).toBe(true)
    })

    it('does not keep instagram_request tag active when latest message is outbound', () => {
        const conversation = buildConversation({
            tags: ['instagram_request']
        })
        const history = [
            buildMessage({
                sender_type: 'contact',
                metadata: { instagram_event_source: 'standby' },
                content: 'Merhaba'
            }),
            buildMessage({
                id: 'msg-2',
                sender_type: 'user',
                metadata: {},
                content: 'Selam'
            })
        ]

        expect(isInstagramRequestConversation(conversation, history)).toBe(false)
    })

    it('keeps instagram_request tag active when latest inbound metadata is messaging but no outbound reply exists', () => {
        const conversation = buildConversation({
            tags: ['instagram_request']
        })
        const history = [
            buildMessage({
                sender_type: 'contact',
                metadata: { instagram_event_source: 'messaging' },
                content: 'Selam'
            })
        ]

        expect(isInstagramRequestConversation(conversation, history)).toBe(true)
    })

    it('treats standby preview metadata as request-origin conversation', () => {
        const conversation = buildConversation({
            tags: [],
            messages: [{
                sender_type: 'contact',
                content: 'Merhaba',
                created_at: '2026-03-10T12:45:00.000Z',
                metadata: {
                    instagram_event_source: 'standby'
                }
            }]
        })

        expect(isInstagramRequestConversation(conversation)).toBe(true)
    })

    it('falls back to request-origin when instagram contact is unresolved numeric id', () => {
        const conversation = buildConversation({
            tags: [],
            contact_name: '1400879865404973',
            messages: [{
                sender_type: 'contact',
                content: 'Merhaba',
                created_at: '2026-03-10T12:45:00.000Z',
                metadata: {}
            }]
        })

        expect(isInstagramRequestConversation(conversation)).toBe(true)
    })

    it('does not apply unresolved-id fallback when conversation already has outbound replies', () => {
        const conversation = buildConversation({
            tags: [],
            contact_name: '1400879865404973',
            messages: [{
                sender_type: 'contact',
                content: 'Merhaba',
                created_at: '2026-03-10T12:45:00.000Z',
                metadata: {}
            }]
        })

        const history = [
            buildMessage({
                sender_type: 'contact',
                metadata: {},
                content: 'Merhaba'
            }),
            buildMessage({
                id: 'msg-2',
                sender_type: 'user',
                metadata: {},
                content: 'Selam'
            })
        ]

        expect(isInstagramRequestConversation(conversation, history)).toBe(false)
    })

    it('prefers instagram username from message metadata when contact name is numeric id', () => {
        const conversation = buildConversation()
        const messages = [
            buildMessage({
                metadata: {
                    instagram_contact_username: 'itsalinayalin',
                    instagram_event_source: 'standby'
                }
            })
        ]

        expect(resolveInboxContactDisplayName(conversation, messages)).toBe('itsalinayalin')
    })

    it('keeps stored contact name for non-instagram conversations', () => {
        const conversation = buildConversation({
            platform: 'whatsapp',
            contact_name: 'Ayse'
        })

        expect(resolveInboxContactDisplayName(conversation, [])).toBe('Ayse')
    })
})
