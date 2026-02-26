import { describe, expect, it } from 'vitest'
import type { ConversationListItem } from '@/lib/inbox/actions'
import {
    filterConversationsByQueue,
    summarizeConversationQueueCounts,
    type InboxQueueTab
} from './conversationQueueFilters'

function createConversation(overrides: Partial<ConversationListItem> = {}): ConversationListItem {
    return {
        id: 'conv-1',
        organization_id: 'org-1',
        contact_name: 'Ayse',
        contact_phone: '905551112233',
        platform: 'whatsapp',
        status: 'open',
        assignee_id: null,
        active_agent: 'bot',
        ai_processing_paused: false,
        last_message_at: '2026-02-26T12:00:00.000Z',
        unread_count: 0,
        tags: [],
        created_at: '2026-02-26T11:00:00.000Z',
        updated_at: '2026-02-26T12:00:00.000Z',
        ...overrides
    }
}

describe('filterConversationsByQueue', () => {
    const conversations: ConversationListItem[] = [
        createConversation({ id: 'me-1', assignee_id: 'me' }),
        createConversation({ id: 'me-2', assignee_id: 'me', human_attention_required: true }),
        createConversation({ id: 'unassigned-operator', active_agent: 'operator', assignee_id: null }),
        createConversation({
            id: 'unassigned-attention',
            active_agent: 'operator',
            assignee_id: null,
            human_attention_required: true
        }),
        createConversation({ id: 'other-1', assignee_id: 'other-user' })
    ]

    it.each<[InboxQueueTab, string[]]>([
        ['me', ['me-1', 'me-2']],
        ['unassigned', ['unassigned-operator', 'unassigned-attention']],
        ['all', ['me-1', 'me-2', 'unassigned-operator', 'unassigned-attention', 'other-1']]
    ])('filters %s queue correctly', (queue, expectedIds) => {
        const result = filterConversationsByQueue({
            conversations,
            queue,
            currentUserId: 'me'
        })

        expect(result.map((conversation) => conversation.id)).toEqual(expectedIds)
    })

    it('returns empty me queue when current user id is missing', () => {
        const result = filterConversationsByQueue({
            conversations,
            queue: 'me',
            currentUserId: null
        })

        expect(result).toEqual([])
    })
})

describe('summarizeConversationQueueCounts', () => {
    it('returns queue totals and attention counters', () => {
        const conversations: ConversationListItem[] = [
            createConversation({ id: 'me-1', assignee_id: 'me', human_attention_required: true }),
            createConversation({ id: 'me-2', assignee_id: 'me' }),
            createConversation({
                id: 'unassigned-1',
                active_agent: 'operator',
                assignee_id: null,
                human_attention_required: true
            }),
            createConversation({ id: 'all-1', assignee_id: 'other' })
        ]

        const result = summarizeConversationQueueCounts({
            conversations,
            currentUserId: 'me'
        })

        expect(result).toEqual({
            me: 2,
            unassigned: 1,
            all: 4,
            meAttention: 1,
            unassignedAttention: 1
        })
    })
})
