import { describe, expect, it } from 'vitest'
import type { ConversationListItem } from '@/lib/inbox/actions'
import { applyInboxListFilters } from '@/components/inbox/conversationListFilters'

function createConversation(
  id: string,
  overrides: Partial<ConversationListItem> = {}
): ConversationListItem {
  return {
    id,
    organization_id: 'org-1',
    contact_name: `Contact ${id}`,
    contact_phone: `+90555${id}`,
    platform: 'whatsapp',
    status: 'open',
    active_agent: 'bot',
    ai_processing_paused: false,
    unread_count: 0,
    assignee_id: null,
    assignee_assigned_at: null,
    last_message_at: '2026-03-25T09:00:00.000Z',
    created_at: '2026-03-25T08:00:00.000Z',
    updated_at: '2026-03-25T09:00:00.000Z',
    tags: [],
    leads: [],
    ...overrides,
  }
}

describe('applyInboxListFilters', () => {
  it('returns all conversations when no filters are active', () => {
    const conversations = [
      createConversation('all-read'),
      createConversation('unread-hot', {
        unread_count: 2,
        leads: [{ status: 'hot' }],
      }),
    ]

    const result = applyInboxListFilters({
      conversations,
      unreadFilter: 'all',
      leadTemperatureFilter: 'all',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['all-read', 'unread-hot'])
  })

  it('keeps only unread conversations when unread filter is active', () => {
    const conversations = [
      createConversation('read'),
      createConversation('unread', { unread_count: 1 }),
    ]

    const result = applyInboxListFilters({
      conversations,
      unreadFilter: 'unread',
      leadTemperatureFilter: 'all',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['unread'])
  })

  it('keeps only matching lead temperatures', () => {
    const conversations = [
      createConversation('cold', { leads: [{ status: 'cold' }] }),
      createConversation('warm', { leads: [{ status: 'warm' }] }),
      createConversation('hot', { leads: [{ status: 'hot' }] }),
      createConversation('missing-status'),
    ]

    const result = applyInboxListFilters({
      conversations,
      unreadFilter: 'all',
      leadTemperatureFilter: 'warm',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['warm'])
  })

  it('intersects unread and lead temperature filters together', () => {
    const conversations = [
      createConversation('unread-hot', {
        unread_count: 1,
        leads: [{ status: 'hot' }],
      }),
      createConversation('read-hot', {
        unread_count: 0,
        leads: [{ status: 'hot' }],
      }),
      createConversation('unread-cold', {
        unread_count: 3,
        leads: [{ status: 'cold' }],
      }),
    ]

    const result = applyInboxListFilters({
      conversations,
      unreadFilter: 'unread',
      leadTemperatureFilter: 'hot',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['unread-hot'])
  })

  it('includes conversations that become eligible after a realtime-style array update', () => {
    const initialConversations = [
      createConversation('conv-1'),
      createConversation('conv-2', { unread_count: 0 }),
    ]

    const initialResult = applyInboxListFilters({
      conversations: initialConversations,
      unreadFilter: 'unread',
      leadTemperatureFilter: 'all',
    })

    expect(initialResult).toEqual([])

    const updatedConversations = [
      initialConversations[0],
      createConversation('conv-2', { unread_count: 1 }),
    ]

    const updatedResult = applyInboxListFilters({
      conversations: updatedConversations,
      unreadFilter: 'unread',
      leadTemperatureFilter: 'all',
    })

    expect(updatedResult.map((conversation) => conversation.id)).toEqual(['conv-2'])
  })

  it('hides instagram conversations whose only preview message is a deleted event', () => {
    const conversations = [
      createConversation('deleted-only-instagram', {
        platform: 'instagram',
        unread_count: 1,
        messages: [
          {
            content: '[Instagram message deleted]',
            created_at: '2026-03-29T15:00:00.000Z',
            sender_type: 'contact',
            metadata: {
              instagram_event_type: 'message_deleted',
              instagram_message_id: 'igmid-1',
            },
          },
        ],
      }),
      createConversation('normal-instagram', {
        platform: 'instagram',
        unread_count: 1,
        messages: [
          {
            content: 'Merhaba',
            created_at: '2026-03-29T15:01:00.000Z',
            sender_type: 'contact',
            metadata: {
              instagram_event_type: 'message',
              instagram_message_id: 'igmid-2',
            },
          },
        ],
      }),
    ]

    const result = applyInboxListFilters({
      conversations,
      unreadFilter: 'all',
      leadTemperatureFilter: 'all',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['normal-instagram'])
  })

  it('keeps established instagram conversations even when one preview message is deleted', () => {
    const conversations = [
      createConversation('existing-instagram', {
        platform: 'instagram',
        unread_count: 1,
        messages: [
          {
            content: '[Instagram message deleted]',
            created_at: '2026-03-29T15:02:00.000Z',
            sender_type: 'contact',
            metadata: {
              instagram_event_type: 'message_deleted',
              instagram_message_id: 'igmid-3',
            },
          },
          {
            content: 'Onceki mesaj',
            created_at: '2026-03-29T14:55:00.000Z',
            sender_type: 'contact',
            metadata: {
              instagram_event_type: 'message',
              instagram_message_id: 'igmid-4',
            },
          },
        ],
      }),
    ]

    const result = applyInboxListFilters({
      conversations,
      unreadFilter: 'all',
      leadTemperatureFilter: 'all',
    })

    expect(result.map((conversation) => conversation.id)).toEqual(['existing-instagram'])
  })
})
