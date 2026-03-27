import { describe, expect, it } from 'vitest'

import {
  resolveSelectedConversationUnreadCountOnIncoming,
  shouldAutoMarkConversationRead,
  shouldClearManualUnreadOnSelect,
} from '@/components/inbox/manualUnreadState'

describe('manual unread state helpers', () => {
  it('skips auto-read for conversations manually marked unread', () => {
    expect(
      shouldAutoMarkConversationRead({
        unread_count: 1,
        manual_unread: true,
      })
    ).toBe(false)

    expect(
      shouldAutoMarkConversationRead({
        unread_count: 1,
        manual_unread: false,
      })
    ).toBe(true)
  })

  it('clears manual unread when the operator comes back from another conversation', () => {
    expect(
      shouldClearManualUnreadOnSelect({
        previousSelectedId: 'conv-a',
        nextSelectedId: 'conv-b',
        nextConversation: {
          manual_unread: true,
        },
      })
    ).toBe(true)

    expect(
      shouldClearManualUnreadOnSelect({
        previousSelectedId: null,
        nextSelectedId: 'conv-b',
        nextConversation: {
          manual_unread: true,
        },
      })
    ).toBe(false)
  })

  it('keeps selected manual-unread threads unread during realtime inserts', () => {
    expect(
      resolveSelectedConversationUnreadCountOnIncoming({
        isSelectedConversation: true,
        shouldIncrementUnread: true,
        unreadCount: 1,
        manualUnread: true,
      })
    ).toBe(1)

    expect(
      resolveSelectedConversationUnreadCountOnIncoming({
        isSelectedConversation: true,
        shouldIncrementUnread: true,
        unreadCount: 0,
        manualUnread: false,
      })
    ).toBe(0)
  })
})
