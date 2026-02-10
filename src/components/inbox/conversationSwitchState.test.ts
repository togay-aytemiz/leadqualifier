import { describe, expect, it } from 'vitest'

import { shouldShowConversationSkeleton } from '@/components/inbox/conversationSwitchState'

describe('shouldShowConversationSkeleton', () => {
    it('returns false when no conversation is selected', () => {
        expect(shouldShowConversationSkeleton(null, null)).toBe(false)
    })

    it('returns true while selected conversation has not loaded yet', () => {
        expect(shouldShowConversationSkeleton('conv-1', null)).toBe(true)
    })

    it('returns true when loaded messages belong to a different conversation', () => {
        expect(shouldShowConversationSkeleton('conv-2', 'conv-1')).toBe(true)
    })

    it('returns false when loaded messages match selected conversation', () => {
        expect(shouldShowConversationSkeleton('conv-2', 'conv-2')).toBe(false)
    })
})
