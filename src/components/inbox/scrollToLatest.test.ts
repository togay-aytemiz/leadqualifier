import { describe, expect, it } from 'vitest'

import { getDistanceFromBottom, shouldShowScrollToLatestButton } from '@/components/inbox/scrollToLatest'

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
