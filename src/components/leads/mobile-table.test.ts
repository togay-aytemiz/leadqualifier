import { describe, expect, it } from 'vitest'

import {
    getMobileRequiredFieldHints,
    MOBILE_REQUIRED_FIELDS_MAX,
    MOBILE_SUMMARY_MAX_CHARS,
    truncateForMobileSummary
} from '@/components/leads/mobile-table'

describe('mobile leads table helpers', () => {
    it('truncates long summaries with an ellipsis for compact rows', () => {
        const longSummary = 'A'.repeat(MOBILE_SUMMARY_MAX_CHARS + 20)

        const truncated = truncateForMobileSummary(longSummary)

        expect(truncated).toHaveLength(MOBILE_SUMMARY_MAX_CHARS)
        expect(truncated.endsWith('…')).toBe(true)
    })

    it('shows a dash when summary is empty', () => {
        expect(truncateForMobileSummary('   ')).toBe('-')
    })

    it('keeps required field hints compact and ordered', () => {
        const hints = getMobileRequiredFieldHints(
            {
                extracted_fields: {
                    budget: '20.000 TL',
                    city: 'Istanbul',
                    timeline: 'next week'
                }
            },
            ['city', 'budget', 'timeline']
        )

        expect(hints).toHaveLength(MOBILE_REQUIRED_FIELDS_MAX)
        expect(hints[0]).toEqual({ field: 'city', value: 'Istanbul' })
        expect(hints[1]).toEqual({ field: 'budget', value: '20.000 TL' })
    })

    it('reads required fields from required_intake_collected payload', () => {
        const hints = getMobileRequiredFieldHints(
            {
                extracted_fields: {
                    required_intake_collected: {
                        city: 'Istanbul',
                        budget: '20.000 TL',
                        timeline: 'next week'
                    }
                }
            },
            ['city', 'budget', 'timeline']
        )

        expect(hints).toHaveLength(MOBILE_REQUIRED_FIELDS_MAX)
        expect(hints[0]).toEqual({ field: 'city', value: 'Istanbul' })
        expect(hints[1]).toEqual({ field: 'budget', value: '20.000 TL' })
    })

    it('filters out missing required field values', () => {
        const hints = getMobileRequiredFieldHints(
            {
                extracted_fields: {
                    city: '',
                    budget: null,
                    notes: 'prefers weekend'
                }
            },
            ['city', 'budget', 'notes']
        )

        expect(hints).toEqual([{ field: 'notes', value: 'prefers weekend' }])
    })
})
