import { describe, expect, it, vi } from 'vitest'
import { getOrganizationBillingLedger } from './server'

vi.mock('@/lib/supabase/server', () => ({
    createClient: vi.fn()
}))

describe('getOrganizationBillingLedger', () => {
    it('can restrict ledger history to purchase entry types before applying the limit', async () => {
        const limitMock = vi.fn(async () => ({
            data: [{
                id: 'ledger_1',
                entry_type: 'package_grant',
                credit_pool: 'package_pool',
                credits_delta: 1000,
                balance_after: 1000,
                reason: 'Iyzico subscription checkout success',
                metadata: {},
                created_at: '2026-04-02T11:30:58.659Z'
            }],
            error: null
        }))
        const orderMock = vi.fn(() => ({ limit: limitMock }))
        const inMock = vi.fn(() => ({ order: orderMock }))
        const eqMock = vi.fn(() => ({
            in: inMock,
            order: orderMock
        }))
        const selectMock = vi.fn(() => ({ eq: eqMock }))
        const fromMock = vi.fn(() => ({ select: selectMock }))

        const rows = await getOrganizationBillingLedger('org_1', {
            supabase: { from: fromMock } as never,
            limit: 50,
            entryTypes: ['package_grant', 'purchase_credit']
        })

        expect(rows).toHaveLength(1)
        expect(inMock).toHaveBeenCalledWith('entry_type', ['package_grant', 'purchase_credit'])
        expect(orderMock).toHaveBeenCalledWith('created_at', { ascending: false })
        expect(limitMock).toHaveBeenCalledWith(50)
    })
})
