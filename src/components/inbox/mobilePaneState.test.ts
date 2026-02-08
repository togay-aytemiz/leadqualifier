import { describe, expect, it } from 'vitest'

import {
    getMobileDetailsOverlayClasses,
    getMobileDetailsPanelClasses,
    getMobileConversationPaneClasses,
    getMobileListPaneClasses
} from '@/components/inbox/mobilePaneState'

describe('mobile pane state helpers', () => {
    it('keeps list pane visible when conversation is closed', () => {
        const classes = getMobileListPaneClasses(false)

        expect(classes).toContain('translate-x-0')
        expect(classes).toContain('pointer-events-auto')
    })

    it('slides list pane left when conversation is open', () => {
        const classes = getMobileListPaneClasses(true)

        expect(classes).toContain('-translate-x-full')
        expect(classes).toContain('pointer-events-none')
    })

    it('keeps conversation pane hidden on the right when closed', () => {
        const classes = getMobileConversationPaneClasses(false)

        expect(classes).toContain('translate-x-full')
        expect(classes).toContain('pointer-events-none')
    })

    it('slides conversation pane in from the right when open', () => {
        const classes = getMobileConversationPaneClasses(true)

        expect(classes).toContain('translate-x-0')
        expect(classes).toContain('pointer-events-auto')
    })

    it('shows a dark overlay when details panel is open', () => {
        const classes = getMobileDetailsOverlayClasses(true)

        expect(classes).toContain('opacity-100')
        expect(classes).toContain('pointer-events-auto')
    })

    it('hides overlay interactions when details panel is closed', () => {
        const classes = getMobileDetailsOverlayClasses(false)

        expect(classes).toContain('opacity-0')
        expect(classes).toContain('pointer-events-none')
    })

    it('animates details panel in/out', () => {
        const openClasses = getMobileDetailsPanelClasses(true)
        const closedClasses = getMobileDetailsPanelClasses(false)

        expect(openClasses).toContain('opacity-100')
        expect(openClasses).toContain('translate-y-0')
        expect(closedClasses).toContain('opacity-0')
        expect(closedClasses).toContain('-translate-y-2')
    })
})
