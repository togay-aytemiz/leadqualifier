import { describe, expect, it } from 'vitest'
import type { Message } from '@/types/database'

import {
    prependOlderMessages,
    resolveRestoredScrollTop,
    shouldLoadOlderMessages
} from '@/components/inbox/messagePagination'

function createMessage(overrides: Partial<Message>): Message {
    return {
        id: 'msg-1',
        conversation_id: 'conv-1',
        sender_type: 'contact',
        content: 'x',
        metadata: {},
        created_at: '2026-03-01T10:00:00.000Z',
        ...overrides
    }
}

describe('shouldLoadOlderMessages', () => {
    it('returns true when near top and loading is available', () => {
        expect(shouldLoadOlderMessages({ scrollTop: 24, hasMore: true, isLoading: false })).toBe(true)
    })

    it('returns false when already loading or no more history', () => {
        expect(shouldLoadOlderMessages({ scrollTop: 24, hasMore: false, isLoading: false })).toBe(false)
        expect(shouldLoadOlderMessages({ scrollTop: 24, hasMore: true, isLoading: true })).toBe(false)
    })

    it('returns false when user is not near top', () => {
        expect(shouldLoadOlderMessages({ scrollTop: 200, hasMore: true, isLoading: false, threshold: 80 })).toBe(false)
    })
})

describe('prependOlderMessages', () => {
    it('prepends older messages, dedupes by id, and keeps chronological order', () => {
        const current = [
            createMessage({ id: 'c', created_at: '2026-03-01T10:03:00.000Z' }),
            createMessage({ id: 'd', created_at: '2026-03-01T10:04:00.000Z' })
        ]
        const older = [
            createMessage({ id: 'b', created_at: '2026-03-01T10:02:00.000Z' }),
            createMessage({ id: 'c', created_at: '2026-03-01T10:03:00.000Z' })
        ]

        const result = prependOlderMessages({
            currentMessages: current,
            olderBatch: older
        })

        expect(result.mergedMessages.map((message) => message.id)).toEqual(['b', 'c', 'd'])
        expect(result.addedCount).toBe(1)
    })
})

describe('resolveRestoredScrollTop', () => {
    it('restores visual position after prepending older messages', () => {
        expect(resolveRestoredScrollTop({
            previousScrollHeight: 900,
            previousScrollTop: 120,
            nextScrollHeight: 1280
        })).toBe(500)
    })

    it('never returns negative values', () => {
        expect(resolveRestoredScrollTop({
            previousScrollHeight: 900,
            previousScrollTop: 0,
            nextScrollHeight: 100
        })).toBe(0)
    })
})
