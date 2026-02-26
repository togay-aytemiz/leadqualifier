import { describe, expect, it } from 'vitest'
import { buildMessageDateSeparators } from '@/components/inbox/messageDateSeparators'

type MessageLike = {
    id: string
    created_at: string
}

describe('buildMessageDateSeparators', () => {
    it('adds a separator for each date boundary with localized today/yesterday labels', () => {
        const messages: MessageLike[] = [
            { id: 'm1', created_at: '2026-02-20T12:00:00.000Z' },
            { id: 'm2', created_at: '2026-02-20T13:00:00.000Z' },
            { id: 'm3', created_at: '2026-02-25T16:20:00.000Z' },
            { id: 'm4', created_at: '2026-02-25T17:40:00.000Z' },
            { id: 'm5', created_at: '2026-02-26T09:00:00.000Z' }
        ]

        const separators = buildMessageDateSeparators({
            messages,
            now: new Date('2026-02-26T12:00:00.000Z'),
            todayLabel: 'Today',
            yesterdayLabel: 'Yesterday'
        })

        expect(separators).toHaveLength(3)
        expect(separators[0]).toEqual({
            messageId: 'm1',
            label: expect.stringMatching(/2026/)
        })
        expect(separators[1]).toEqual({
            messageId: 'm3',
            label: 'Yesterday'
        })
        expect(separators[2]).toEqual({
            messageId: 'm5',
            label: 'Today'
        })
    })

    it('skips invalid timestamps instead of rendering a broken separator', () => {
        const messages: MessageLike[] = [
            { id: 'm1', created_at: 'invalid-date' },
            { id: 'm2', created_at: '2026-02-26T09:00:00.000Z' }
        ]

        const separators = buildMessageDateSeparators({
            messages,
            now: new Date('2026-02-26T12:00:00.000Z'),
            todayLabel: 'Today',
            yesterdayLabel: 'Yesterday'
        })

        expect(separators).toEqual([{ messageId: 'm2', label: 'Today' }])
    })
})
