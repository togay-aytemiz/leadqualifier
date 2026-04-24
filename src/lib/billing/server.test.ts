import { describe, expect, it, vi } from 'vitest'
import {
    getOrganizationBillingLedger,
    getOrganizationBillingLedgerPage,
    getOrganizationBillingLedgerWindow
} from './server'

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

describe('getOrganizationBillingLedgerPage', () => {
    it('applies month filtering and range pagination before returning the next page marker', async () => {
        const rows = Array.from({ length: 26 }, (_, index) => ({
            id: `ledger_${index + 1}`,
            entry_type: index === 0 ? 'purchase_credit' : 'usage_debit',
            credit_pool: index === 0 ? 'topup_pool' : 'package_pool',
            credits_delta: index === 0 ? 1000 : -0.2,
            balance_after: 2000 - index,
            reason: index === 0 ? 'Iyzico top-up checkout success' : 'AI usage debit',
            metadata: {},
            created_at: `2026-04-${String(index + 1).padStart(2, '0')}T09:00:00.000Z`
        }))
        const query = {
            eq: vi.fn(() => query),
            gte: vi.fn(() => query),
            lt: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async () => ({ data: rows, error: null }))
        }
        const selectMock = vi.fn(() => query)
        const fromMock = vi.fn(() => ({ select: selectMock }))

        const page = await getOrganizationBillingLedgerPage('org_1', {
            supabase: { from: fromMock } as never,
            limit: 25,
            offset: 25,
            period: 'current_month',
            now: new Date('2026-04-24T10:00:00.000Z')
        })

        expect(query.gte).toHaveBeenCalledWith('created_at', '2026-03-31T21:00:00.000Z')
        expect(query.lt).toHaveBeenCalledWith('created_at', '2026-04-30T21:00:00.000Z')
        expect(query.range).toHaveBeenCalledWith(25, 50)
        expect(page.entries).toHaveLength(25)
        expect(page.hasMore).toBe(true)
        expect(page.nextOffset).toBe(50)
    })

    it('does not apply date bounds for all-time ledger loading', async () => {
        const query = {
            eq: vi.fn(() => query),
            gte: vi.fn(() => query),
            lt: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async () => ({ data: [], error: null }))
        }
        const fromMock = vi.fn(() => ({ select: vi.fn(() => query) }))

        await getOrganizationBillingLedgerPage('org_1', {
            supabase: { from: fromMock } as never,
            limit: 25,
            offset: 0,
            period: 'all',
            now: new Date('2026-04-24T10:00:00.000Z')
        })

        expect(query.gte).not.toHaveBeenCalled()
        expect(query.lt).not.toHaveBeenCalled()
        expect(query.range).toHaveBeenCalledWith(0, 25)
    })
})

describe('getOrganizationBillingLedgerWindow', () => {
    it('loads a complete weekly aggregate window and applies the loads movement filter', async () => {
        const rows = [{
            id: 'ledger_load_1',
            entry_type: 'package_grant',
            credit_pool: 'package_pool',
            credits_delta: 2000,
            balance_after: 3000,
            reason: 'Monthly package grant',
            metadata: {},
            created_at: '2026-04-20T09:00:00.000Z'
        }]
        const query = {
            eq: vi.fn(() => query),
            gt: vi.fn(() => query),
            lt: vi.fn(() => query),
            gte: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async () => ({ data: rows, error: null }))
        }
        const fromMock = vi.fn(() => ({ select: vi.fn(() => query) }))

        const page = await getOrganizationBillingLedgerWindow('org_1', {
            supabase: { from: fromMock } as never,
            period: 'all',
            movement: 'loads',
            view: 'week',
            offset: 0,
            now: new Date('2026-04-24T10:00:00.000Z')
        })

        expect(query.gt).toHaveBeenCalledWith('credits_delta', 0)
        expect(query.gte).toHaveBeenCalledWith('created_at', '2026-04-05T21:00:00.000Z')
        expect(query.lt).toHaveBeenCalledWith('created_at', '2026-04-26T21:00:00.000Z')
        expect(query.range).toHaveBeenCalledWith(0, 999)
        expect(page.entries).toHaveLength(1)
        expect(page.nextOffset).toBe(3)
    })

    it('loads daily aggregate windows in ten-day steps for usage movements', async () => {
        const query = {
            eq: vi.fn(() => query),
            gt: vi.fn(() => query),
            lt: vi.fn(() => query),
            gte: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async () => ({ data: [], error: null }))
        }
        const fromMock = vi.fn(() => ({ select: vi.fn(() => query) }))

        await getOrganizationBillingLedgerWindow('org_1', {
            supabase: { from: fromMock } as never,
            period: 'all',
            movement: 'usage',
            view: 'day',
            offset: 10,
            now: new Date('2026-04-24T10:00:00.000Z')
        })

        expect(query.lt).toHaveBeenCalledWith('credits_delta', 0)
        expect(query.gte).toHaveBeenCalledWith('created_at', '2026-04-04T21:00:00.000Z')
        expect(query.lt).toHaveBeenCalledWith('created_at', '2026-04-14T21:00:00.000Z')
    })

    it('does not cut weekly aggregate windows at month boundaries', async () => {
        const query = {
            eq: vi.fn(() => query),
            gt: vi.fn(() => query),
            lt: vi.fn(() => query),
            gte: vi.fn(() => query),
            order: vi.fn(() => query),
            range: vi.fn(async () => ({ data: [], error: null }))
        }
        const fromMock = vi.fn(() => ({ select: vi.fn(() => query) }))

        await getOrganizationBillingLedgerWindow('org_1', {
            supabase: { from: fromMock } as never,
            period: 'current_month',
            movement: 'all',
            view: 'week',
            offset: 3,
            now: new Date('2026-04-24T10:00:00.000Z')
        })

        expect(query.gte).toHaveBeenCalledWith('created_at', '2026-03-15T21:00:00.000Z')
        expect(query.lt).toHaveBeenCalledWith('created_at', '2026-04-05T21:00:00.000Z')
    })
})
