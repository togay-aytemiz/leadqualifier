import { describe, expect, it } from 'vitest'
import { resolveBillingRegionByCountry, resolveBillingRegionFromRequestHeaders } from '@/lib/billing/request-region'

function createHeaders(values: Record<string, string>): Headers {
    const headers = new Headers()
    for (const [key, value] of Object.entries(values)) {
        headers.set(key, value)
    }
    return headers
}

describe('billing request region resolver', () => {
    it('maps TR country code to TR region', () => {
        expect(resolveBillingRegionByCountry('TR')).toBe('TR')
        expect(resolveBillingRegionByCountry('tr')).toBe('TR')
    })

    it('maps non-TR country code to INTL region', () => {
        expect(resolveBillingRegionByCountry('US')).toBe('INTL')
        expect(resolveBillingRegionByCountry('DE')).toBe('INTL')
    })

    it('reads country from request geo headers', () => {
        expect(resolveBillingRegionFromRequestHeaders(createHeaders({
            'x-vercel-ip-country': 'TR'
        }))).toBe('TR')

        expect(resolveBillingRegionFromRequestHeaders(createHeaders({
            'cf-ipcountry': 'US'
        }))).toBe('INTL')
    })

    it('falls back to accept-language when geo headers are unavailable', () => {
        expect(resolveBillingRegionFromRequestHeaders(createHeaders({
            'accept-language': 'tr-TR,tr;q=0.9,en-US;q=0.8'
        }))).toBe('TR')

        expect(resolveBillingRegionFromRequestHeaders(createHeaders({
            'accept-language': 'en-US,en;q=0.9'
        }))).toBe('INTL')
    })

    it('defaults to INTL when no signal exists', () => {
        expect(resolveBillingRegionFromRequestHeaders(createHeaders({}))).toBe('INTL')
    })
})
