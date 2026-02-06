import { describe, expect, it } from 'vitest'

import { getInboxMessageBubbleClasses, getInboxOutgoingBubbleClasses } from '@/components/inbox/chatWindowStyles'

describe('getInboxMessageBubbleClasses', () => {
    it('uses a dark, high-contrast style for bot messages', () => {
        const classes = getInboxMessageBubbleClasses('bot')

        expect(classes).toContain('bg-violet-800')
        expect(classes).toContain('text-violet-50')
        expect(classes).toContain('rounded-tr-none')
    })
})

describe('getInboxOutgoingBubbleClasses', () => {
    it('uses a dark, high-contrast style for bot outgoing bubbles', () => {
        const classes = getInboxOutgoingBubbleClasses('bot')

        expect(classes).toContain('bg-violet-800')
        expect(classes).toContain('text-violet-50')
    })
})
