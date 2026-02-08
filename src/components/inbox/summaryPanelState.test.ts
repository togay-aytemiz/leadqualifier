import { describe, expect, it } from 'vitest'

import { resolveSummaryToggle } from '@/components/inbox/summaryPanelState'

describe('resolveSummaryToggle', () => {
    it('requests summary regeneration when panel is opened', () => {
        const next = resolveSummaryToggle(false)

        expect(next.nextOpen).toBe(true)
        expect(next.shouldFetch).toBe(true)
        expect(next.resetCachedSummary).toBe(false)
    })

    it('clears cached summary when panel is closed', () => {
        const next = resolveSummaryToggle(true)

        expect(next.nextOpen).toBe(false)
        expect(next.shouldFetch).toBe(false)
        expect(next.resetCachedSummary).toBe(true)
    })
})
