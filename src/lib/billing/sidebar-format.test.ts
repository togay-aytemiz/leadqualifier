import { describe, expect, it } from 'vitest'

import {
    formatSidebarBillingCompactCredits,
    formatSidebarBillingCredits,
    formatSidebarBillingDate
} from '@/lib/billing/sidebar-format'

describe('formatSidebarBillingDate', () => {
    it('formats package renewal dates with the active Turkish locale', () => {
        expect(formatSidebarBillingDate('tr', '2026-04-20T00:00:00.000Z')).toBe('20 Nis')
    })

    it('formats package renewal dates with the active English locale', () => {
        expect(formatSidebarBillingDate('en', '2026-04-20T00:00:00.000Z')).toBe('Apr 20')
    })

    it('returns null when the renewal date is invalid', () => {
        expect(formatSidebarBillingDate('tr', 'invalid-date')).toBeNull()
    })
})

describe('formatSidebarBillingCredits', () => {
    it('formats remaining credits with Turkish separators', () => {
        expect(formatSidebarBillingCredits('tr', 2081.1)).toBe('2.081,1')
    })

    it('formats compact credits with Turkish separators', () => {
        expect(formatSidebarBillingCompactCredits('tr', 2081.1)).toBe('2,1 B')
    })
})
