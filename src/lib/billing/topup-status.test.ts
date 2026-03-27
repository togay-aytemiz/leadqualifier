import { describe, expect, it, vi } from 'vitest'
import type { Json } from '@/types/database'
import {
    getOrganizationTopupConsumedCreditsTotal,
    resolveTopupCreditsTotal,
    sumTopupUsageDebits
} from './topup-status'

function createTopupUsageSupabaseMock(rows: Array<{
    credit_pool: string | null
    credits_delta: number | null
    metadata: Json
}>) {
    const inMock = vi.fn(async () => ({ data: rows, error: null }))
    const eqEntryTypeMock = vi.fn(() => ({
        in: inMock
    }))
    const eqOrganizationMock = vi.fn(() => ({
        eq: eqEntryTypeMock
    }))
    const selectMock = vi.fn(() => ({
        eq: eqOrganizationMock
    }))
    const fromMock = vi.fn(() => ({
        select: selectMock
    }))

    return {
        supabase: {
            from: fromMock
        } as unknown as Parameters<typeof getOrganizationTopupConsumedCreditsTotal>[1],
        spies: {
            fromMock,
            selectMock,
            eqOrganizationMock,
            eqEntryTypeMock,
            inMock
        }
    }
}

describe('topup status helpers', () => {
    it('sums topup usage from topup-only and mixed debit rows', () => {
        const consumed = sumTopupUsageDebits([
            {
                credit_pool: 'topup_pool',
                credits_delta: -30,
                metadata: null
            },
            {
                credit_pool: 'mixed',
                credits_delta: -20,
                metadata: {
                    topup_debit: 16.5,
                    package_debit: 3.5
                }
            },
            {
                credit_pool: 'package_pool',
                credits_delta: -40,
                metadata: {
                    package_debit: 40
                }
            },
            {
                credit_pool: 'topup_pool',
                credits_delta: 4,
                metadata: null
            }
        ])

        expect(consumed).toBe(46.5)
    })

    it('reconstructs the displayed topup total from remaining balance and consumed usage', () => {
        expect(resolveTopupCreditsTotal({
            currentBalance: 153.5,
            consumedCredits: 46.5
        })).toBe(200)
    })

    it('loads consumed topup credits from ledger usage rows', async () => {
        const { supabase, spies } = createTopupUsageSupabaseMock([
            {
                credit_pool: 'topup_pool',
                credits_delta: -30,
                metadata: null
            },
            {
                credit_pool: 'mixed',
                credits_delta: -20,
                metadata: {
                    topup_debit: 16.5
                }
            }
        ])

        await expect(getOrganizationTopupConsumedCreditsTotal('org_123', supabase)).resolves.toBe(46.5)
        expect(spies.fromMock).toHaveBeenCalledWith('organization_credit_ledger')
        expect(spies.selectMock).toHaveBeenCalledWith('credit_pool, credits_delta, metadata')
        expect(spies.eqOrganizationMock).toHaveBeenCalledWith('organization_id', 'org_123')
        expect(spies.eqEntryTypeMock).toHaveBeenCalledWith('entry_type', 'usage_debit')
        expect(spies.inMock).toHaveBeenCalledWith('credit_pool', ['topup_pool', 'mixed'])
    })
})
