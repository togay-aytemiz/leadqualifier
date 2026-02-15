import { describe, expect, it } from 'vitest'

import {
    resolveMonthlySubscriptionAmountTry,
    resolveTopupDebitFromUsageMetadata,
    resolveTopupUsageDebit
} from '@/lib/admin/billing-plan-metrics'
import type { Json } from '@/types/database'

describe('billing plan metrics helpers', () => {
    it('resolves monthly subscription amount from requested monthly price', () => {
        const metadata: Json = { requested_monthly_price_try: 1499.9 }

        expect(resolveMonthlySubscriptionAmountTry(metadata)).toBe(1499.9)
    })

    it('falls back to monthly_price_try when requested key is missing', () => {
        const metadata: Json = { monthly_price_try: '850' }

        expect(resolveMonthlySubscriptionAmountTry(metadata)).toBe(850)
    })

    it('returns zero for malformed subscription metadata', () => {
        const metadata: Json = { requested_monthly_price_try: 'invalid' }

        expect(resolveMonthlySubscriptionAmountTry(metadata)).toBe(0)
    })

    it('resolves topup debit from mixed usage metadata', () => {
        const metadata: Json = { topup_debit: 4.2, package_debit: 1.1 }

        expect(resolveTopupDebitFromUsageMetadata(metadata)).toBe(4.2)
    })

    it('returns zero when topup debit key is missing', () => {
        const metadata: Json = { package_debit: 3.4 }

        expect(resolveTopupDebitFromUsageMetadata(metadata)).toBe(0)
    })

    it('falls back to credits delta for topup pool rows when metadata is missing', () => {
        expect(resolveTopupUsageDebit({
            metadata: { package_debit: 0 },
            creditPool: 'topup_pool',
            creditsDelta: -2.5
        })).toBe(2.5)
    })
})
