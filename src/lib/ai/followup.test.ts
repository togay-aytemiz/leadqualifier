import { describe, expect, it } from 'vitest'
import { appendFollowupQuestion } from '@/lib/ai/followup'

describe('appendFollowupQuestion', () => {
    it('appends follow-up question when provided', () => {
        expect(appendFollowupQuestion('Merhaba', 'Hangi hizmet?'))
            .toBe('Merhaba\n\nHangi hizmet?')
    })

    it('returns reply unchanged when follow-up is empty', () => {
        expect(appendFollowupQuestion('Merhaba', '  ')).toBe('Merhaba')
    })
})
