import { describe, expect, it } from 'vitest'
import {
    MAX_CONVERSATION_TAGS,
    MAX_CONVERSATION_TAG_LENGTH,
    normalizeConversationTags
} from '@/lib/inbox/conversation-tags'

describe('normalizeConversationTags', () => {
    it('trims and dedupes tags case-insensitively', () => {
        expect(normalizeConversationTags([' VIP ', 'vip', 'Hot Lead'])).toEqual(['VIP', 'Hot Lead'])
    })

    it('rejects tags longer than the max length', () => {
        expect(() => normalizeConversationTags(['x'.repeat(MAX_CONVERSATION_TAG_LENGTH + 1)])).toThrow('tag_too_long')
    })

    it('rejects more than the max tag count', () => {
        expect(() => normalizeConversationTags(
            Array.from({ length: MAX_CONVERSATION_TAGS + 1 }, (_, index) => `tag-${index}`)
        )).toThrow('too_many_tags')
    })
})
