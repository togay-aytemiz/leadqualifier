import { describe, expect, it } from 'vitest'
import {
    normalizeBillingRegion,
    resolveBillingRegionByCountry,
    resolveBillingRegionForOrganization,
    resolveBillingRegionFromRequestHeaders
} from '@/lib/billing/request-region'

function createHeaders(values: Record<string, string>): Headers {
    const headers = new Headers()
    for (const [key, value] of Object.entries(values)) {
        headers.set(key, value)
    }
    return headers
}

describe('billing request region resolver', () => {
    it('normalizes only supported billing regions', () => {
        expect(normalizeBillingRegion('TR')).toBe('TR')
        expect(normalizeBillingRegion('intl')).toBe('INTL')
        expect(normalizeBillingRegion('US')).toBeNull()
        expect(normalizeBillingRegion('')).toBeNull()
        expect(normalizeBillingRegion(null)).toBeNull()
    })

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

    it('prefers persisted organization billing region over request signal', () => {
        expect(resolveBillingRegionForOrganization({
            organizationBillingRegion: 'TR',
            headers: createHeaders({
                'x-vercel-ip-country': 'US'
            })
        })).toBe('TR')

        expect(resolveBillingRegionForOrganization({
            organizationBillingRegion: 'INTL',
            headers: createHeaders({
                'x-vercel-ip-country': 'TR'
            })
        })).toBe('INTL')
    })

    it('falls back to request signal when persisted organization region is missing', () => {
        expect(resolveBillingRegionForOrganization({
            organizationBillingRegion: null,
            headers: createHeaders({
                'x-vercel-ip-country': 'TR'
            })
        })).toBe('TR')

        expect(resolveBillingRegionForOrganization({
            organizationBillingRegion: '',
            headers: createHeaders({
                'x-vercel-ip-country': 'US'
            })
        })).toBe('INTL')
    })
})
