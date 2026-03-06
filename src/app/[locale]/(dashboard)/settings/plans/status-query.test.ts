import { describe, expect, it } from 'vitest'
import { clearPlansStatusSearch } from './status-query'

describe('clearPlansStatusSearch', () => {
    it('removes transient checkout and renewal status params', () => {
        const searchParams = new URLSearchParams({
            checkout_action: 'subscribe',
            checkout_status: 'error',
            checkout_error: 'request_failed',
            checkout_change_type: 'upgrade',
            checkout_effective_at: '2026-03-06T00:00:00.000Z',
            renewal_action: 'cancel',
            renewal_status: 'success',
            renewal_error: 'request_failed',
            page: '2',
            filter: 'active'
        })

        expect(clearPlansStatusSearch(searchParams)).toBe('?page=2&filter=active')
    })

    it('returns empty query string when only transient params exist', () => {
        const searchParams = new URLSearchParams({
            checkout_action: 'subscribe',
            checkout_status: 'error'
        })

        expect(clearPlansStatusSearch(searchParams)).toBe('')
    })
})
