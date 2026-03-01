import { describe, expect, it, vi } from 'vitest'

import { getDistanceFromBottom, scrollContainerToBottom, shouldShowScrollToLatestButton } from '@/components/inbox/scrollToLatest'

describe('shouldShowScrollToLatestButton', () => {
    it('returns false when distance is within threshold', () => {
        expect(shouldShowScrollToLatestButton(40, 64)).toBe(false)
    })

    it('returns true when distance is greater than threshold', () => {
        expect(shouldShowScrollToLatestButton(120, 64)).toBe(true)
    })
})

describe('getDistanceFromBottom', () => {
    it('calculates remaining scroll distance correctly', () => {
        const element = {
            scrollHeight: 1000,
            scrollTop: 700,
            clientHeight: 250
        } as HTMLElement

        expect(getDistanceFromBottom(element)).toBe(50)
    })
})

describe('scrollContainerToBottom', () => {
    it('uses scrollTo for smooth behavior without forcing an immediate jump', () => {
        const scrollTo = vi.fn()
        const element = {
            scrollHeight: 1420,
            scrollTop: 120,
            scrollTo
        } as unknown as HTMLElement

        scrollContainerToBottom(element, 'smooth')

        expect(scrollTo).toHaveBeenCalledWith({ top: 1420, behavior: 'smooth' })
        expect(element.scrollTop).toBe(120)
    })

    it('falls back to scrollTop assignment when scrollTo is unavailable', () => {
        const element = {
            scrollHeight: 980,
            scrollTop: 40
        } as unknown as HTMLElement

        scrollContainerToBottom(element)

        expect(element.scrollTop).toBe(980)
    })
})
