import { describe, expect, it } from 'vitest'

import {
  buildConversationPreviewMessages,
  mergeRealtimeConversationUpdate,
} from './conversationListState'

describe('conversationListState helpers', () => {
  it('builds newest-first preview messages from a chronological timeline', () => {
    const previewMessages = buildConversationPreviewMessages([
      {
        id: 'm1',
        content: 'Ilk',
        created_at: '2026-03-21T10:10:00.000Z',
        sender_type: 'contact',
        metadata: {},
      },
      {
        id: 'm2',
        content: 'Ikinci',
        created_at: '2026-03-21T10:11:00.000Z',
        sender_type: 'contact',
        metadata: {},
      },
      {
        id: 'm3',
        content: 'Ucuncu',
        created_at: '2026-03-21T10:12:00.000Z',
        sender_type: 'user',
        metadata: {},
      },
    ])

    expect(previewMessages).toMatchObject([
      {
        content: 'Ucuncu',
        created_at: '2026-03-21T10:12:00.000Z',
        sender_type: 'user',
      },
      {
        content: 'Ikinci',
        created_at: '2026-03-21T10:11:00.000Z',
        sender_type: 'contact',
      },
      {
        content: 'Ilk',
        created_at: '2026-03-21T10:10:00.000Z',
        sender_type: 'contact',
      },
    ])
  })

  it('flags stale previews when a conversation update advances last_message_at beyond the cached preview', () => {
    const result = mergeRealtimeConversationUpdate({
      currentConversation: {
        id: 'conv-1',
        organization_id: 'org-1',
        platform: 'instagram',
        status: 'open',
        contact_name: 'betul_balibey',
        contact_phone: '123',
        contact_avatar_url: null,
        unread_count: 0,
        last_message_at: '2026-03-21T10:10:00.000Z',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:10:00.000Z',
        assignee_id: null,
        ai_processing_paused: false,
        leads: [],
        messages: [],
      },
      incomingConversation: {
        id: 'conv-1',
        organization_id: 'org-1',
        platform: 'instagram',
        status: 'open',
        contact_name: 'betul_balibey',
        contact_phone: '123',
        contact_avatar_url: null,
        unread_count: 1,
        last_message_at: '2026-03-21T10:12:00.000Z',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:12:00.000Z',
        assignee_id: null,
        ai_processing_paused: false,
      },
      nextAssignee: null,
    })

    expect(result.shouldHydratePreview).toBe(true)
    expect(result.conversation.messages).toEqual([])
    expect(result.conversation.last_message_at).toBe('2026-03-21T10:12:00.000Z')
  })

  it('does not request preview hydration when the cached preview already matches the latest message timestamp', () => {
    const result = mergeRealtimeConversationUpdate({
      currentConversation: {
        id: 'conv-1',
        organization_id: 'org-1',
        platform: 'instagram',
        status: 'open',
        contact_name: 'betul_balibey',
        contact_phone: '123',
        contact_avatar_url: null,
        unread_count: 0,
        last_message_at: '2026-03-21T10:12:00.000Z',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:12:00.000Z',
        assignee_id: null,
        ai_processing_paused: false,
        leads: [],
        messages: [
          {
            content: 'Merhaba, bunun hakkinda daha fazla bilgi alabilir miyim?',
            created_at: '2026-03-21T10:12:00.000Z',
            sender_type: 'contact',
            metadata: {},
          },
        ],
      },
      incomingConversation: {
        id: 'conv-1',
        organization_id: 'org-1',
        platform: 'instagram',
        status: 'open',
        contact_name: 'betul_balibey',
        contact_phone: '123',
        contact_avatar_url: null,
        unread_count: 1,
        last_message_at: '2026-03-21T10:12:00.000Z',
        created_at: '2026-03-21T10:00:00.000Z',
        updated_at: '2026-03-21T10:12:00.000Z',
        assignee_id: null,
        ai_processing_paused: false,
      },
      nextAssignee: null,
    })

    expect(result.shouldHydratePreview).toBe(false)
    expect(result.conversation.messages).toHaveLength(1)
  })
})
