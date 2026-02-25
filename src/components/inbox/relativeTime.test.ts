import { describe, expect, it, vi } from 'vitest'
import { formatRelativeTimeFromBase } from '@/components/inbox/relativeTime'

describe('formatRelativeTimeFromBase', () => {
    const targetIso = '2026-02-25T12:00:00.000Z'
    const baseDate = new Date('2026-02-25T14:00:00.000Z')

    it('formats distance using the provided base date', () => {
        const text = formatRelativeTimeFromBase({ targetIso, baseDate })
        expect(text).toBe('2 hours')
    })

    it('does not depend on Date.now', () => {
        const firstNowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-25T17:00:00.000Z').getTime())
        const first = formatRelativeTimeFromBase({ targetIso, baseDate })
        firstNowSpy.mockRestore()

        const secondNowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date('2026-02-27T00:00:00.000Z').getTime())
        const second = formatRelativeTimeFromBase({ targetIso, baseDate })
        secondNowSpy.mockRestore()

        expect(first).toBe(second)
    })

    it('returns empty text for invalid timestamps', () => {
        const text = formatRelativeTimeFromBase({
            targetIso: 'invalid-date',
            baseDate
        })

        expect(text).toBe('')
    })
})
