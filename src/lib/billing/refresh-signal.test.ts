import { describe, expect, it } from 'vitest'

import { buildBillingRefreshSignal } from '@/lib/billing/refresh-signal'

describe('buildBillingRefreshSignal', () => {
    it('returns stable empty signal when no params are available', () => {
        expect(buildBillingRefreshSignal(null)).toBe('')
    })

    it('includes only billing checkout params', () => {
        const params = new URLSearchParams({
            checkout_action: 'subscribe',
            checkout_status: 'success',
            checkout_error: '',
            tab: 'history'
        })

        expect(buildBillingRefreshSignal(params)).toBe(
            'checkout_action=subscribe|checkout_status=success|checkout_error='
        )
    })

    it('changes when checkout values change', () => {
        const successParams = new URLSearchParams({
            checkout_action: 'subscribe',
            checkout_status: 'success'
        })
        const failedParams = new URLSearchParams({
            checkout_action: 'subscribe',
            checkout_status: 'failed'
        })

        expect(buildBillingRefreshSignal(successParams)).not.toBe(buildBillingRefreshSignal(failedParams))
    })
})
