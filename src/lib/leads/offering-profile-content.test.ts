import { describe, it, expect } from 'vitest'
import {
    parseOfferingProfileSummary,
    serializeOfferingProfileItems,
    mergeOfferingProfileItems
} from './offering-profile-content'

describe('offering profile content helpers', () => {
    it('parses newline summary into trimmed list', () => {
        expect(parseOfferingProfileSummary('  A\n\nB  ')).toEqual(['A', 'B'])
    })

    it('serializes list into newline summary', () => {
        expect(serializeOfferingProfileItems(['A', 'B'])).toBe('A\nB')
    })

    it('merges items without duplicates (case-insensitive)', () => {
        expect(mergeOfferingProfileItems(['A'], ['a', 'B'])).toEqual(['A', 'B'])
    })
})
