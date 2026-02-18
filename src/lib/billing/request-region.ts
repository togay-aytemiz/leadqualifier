import type { BillingRegion } from '@/lib/billing/pricing-catalog'

const COUNTRY_HEADER_KEYS = [
    'x-vercel-ip-country',
    'cf-ipcountry',
    'x-country-code',
    'x-geo-country'
] as const

function normalizeCountryCode(value: string | null | undefined): string | null {
    const normalized = (value ?? '').trim().toUpperCase()
    if (!normalized) return null
    if (!/^[A-Z]{2}$/.test(normalized)) return null
    return normalized
}

function resolveCountryFromAcceptLanguage(value: string | null | undefined): string | null {
    if (!value) return null

    const tokens = value
        .split(',')
        .map((segment) => segment.split(';')[0]?.trim().toLowerCase() ?? '')
        .filter(Boolean)

    for (const token of tokens) {
        const normalizedToken = token.replaceAll('_', '-')
        if (normalizedToken === 'tr' || normalizedToken.startsWith('tr-') || normalizedToken.endsWith('-tr')) {
            return 'TR'
        }
    }

    return null
}

export function resolveBillingRegionByCountry(countryCode: string | null | undefined): BillingRegion {
    return normalizeCountryCode(countryCode) === 'TR' ? 'TR' : 'INTL'
}

export function resolveBillingRegionFromRequestHeaders(headers: Pick<Headers, 'get'>): BillingRegion {
    for (const headerKey of COUNTRY_HEADER_KEYS) {
        const countryCode = normalizeCountryCode(headers.get(headerKey))
        if (countryCode) {
            return resolveBillingRegionByCountry(countryCode)
        }
    }

    return resolveBillingRegionByCountry(resolveCountryFromAcceptLanguage(headers.get('accept-language')))
}
