import { describe, expect, it } from 'vitest'
import { resolveAdminOrganizationPaidFee } from '@/lib/admin/organization-paid-fee'

describe('resolveAdminOrganizationPaidFee', () => {
    it('prefers TRY-specific subscription amount keys', () => {
        const result = resolveAdminOrganizationPaidFee({
            metadata: {
                requested_monthly_price_try: '649.5',
                requested_monthly_price_usd: 17.99
            },
            organizationBillingRegion: 'INTL'
        })

        expect(result).toEqual({
            amount: 649.5,
            currency: 'TRY'
        })
    })

    it('resolves USD-specific subscription amount keys', () => {
        const result = resolveAdminOrganizationPaidFee({
            metadata: {
                monthly_price_usd: 26.99
            },
            organizationBillingRegion: 'TR'
        })

        expect(result).toEqual({
            amount: 26.99,
            currency: 'USD'
        })
    })

    it('uses explicit metadata currency for generic price keys', () => {
        const result = resolveAdminOrganizationPaidFee({
            metadata: {
                requested_monthly_price: '14.9',
                requested_monthly_price_currency: 'usd'
            },
            organizationBillingRegion: 'TR'
        })

        expect(result).toEqual({
            amount: 14.9,
            currency: 'USD'
        })
    })

    it('falls back to organization billing region when generic price has no currency', () => {
        const result = resolveAdminOrganizationPaidFee({
            metadata: {
                monthly_price: '349'
            },
            organizationBillingRegion: 'TR'
        })

        expect(result).toEqual({
            amount: 349,
            currency: 'TRY'
        })
    })

    it('returns null values when paid fee cannot be resolved', () => {
        const result = resolveAdminOrganizationPaidFee({
            metadata: {
                requested_monthly_price: 'not-a-number'
            },
            organizationBillingRegion: null
        })

        expect(result).toEqual({
            amount: null,
            currency: null
        })
    })
})
