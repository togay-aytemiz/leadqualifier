import { describe, expect, it } from 'vitest'
import { mergeIntakeFields, normalizeIntakeFields } from '@/lib/leads/offering-profile-utils'

describe('normalizeIntakeFields', () => {
    it('dedupes, trims, and drops empty values', () => {
        expect(normalizeIntakeFields(['  budget ', 'budget', '', '  '])).toEqual(['budget'])
    })
})

describe('mergeIntakeFields', () => {
    it('appends new fields and preserves existing ones', () => {
        expect(mergeIntakeFields(['budget'], ['date', 'budget'])).toEqual(['budget', 'date'])
    })
})
