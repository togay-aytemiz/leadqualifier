import { describe, expect, it, vi } from 'vitest'
import type { Json } from '@/types/database'
import {
    getOrganizationTopupStatusSummary,
    resolveTopupCreditsTotal,
    sumTopupUsageDebits
} from './topup-status'

function createTopupStatusSupabaseMock(rows: Array<{
    entry_type: string | null
    credit_pool: string | null
    credits_delta: number | null
    metadata: Json
}>) {
    const inCreditPoolMock = vi.fn(async () => ({ data: rows, error: null }))
    const inEntryTypeMock = vi.fn(() => ({
        in: inCreditPoolMock
    }))
    const eqOrganizationMock = vi.fn(() => ({
        in: inEntryTypeMock
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
        } as unknown as Parameters<typeof getOrganizationTopupStatusSummary>[1],
        spies: {
            fromMock,
            selectMock,
            eqOrganizationMock,
            inEntryTypeMock,
            inCreditPoolMock
        }
    }
}

describe('topup status helpers', () => {
    it('sums topup usage from topup-only and mixed debit rows', () => {
        const consumed = sumTopupUsageDebits([
            {
                entry_type: 'usage_debit',
                credit_pool: 'topup_pool',
                credits_delta: -30,
                metadata: null
            },
            {
                entry_type: 'usage_debit',
                credit_pool: 'mixed',
                credits_delta: -20,
                metadata: {
                    topup_debit: 16.5,
                    package_debit: 3.5
                }
            },
            {
                entry_type: 'usage_debit',
                credit_pool: 'package_pool',
                credits_delta: -40,
                metadata: {
                    package_debit: 40
                }
            },
            {
                entry_type: 'usage_debit',
                credit_pool: 'topup_pool',
                credits_delta: 4,
                metadata: null
            }
        ])

        expect(consumed).toBe(46.5)
    })

    it('keeps the trial limit as the visible topup total when carryover exists', () => {
        expect(resolveTopupCreditsTotal({
            currentBalance: 153.5,
            consumedCredits: 0,
            trialCreditLimit: 200,
            hasTrialCreditCarryover: true
        })).toBe(200)
    })

    it('reconstructs the displayed topup total from remaining balance and consumed usage', () => {
        expect(resolveTopupCreditsTotal({
            currentBalance: 153.5,
            consumedCredits: 46.5,
            trialCreditLimit: 200,
            hasTrialCreditCarryover: false
        })).toBe(200)
    })

    it('loads consumed topup credits and carryover presence from ledger rows', async () => {
        const { supabase, spies } = createTopupStatusSupabaseMock([
            {
                entry_type: 'adjustment',
                credit_pool: 'topup_pool',
                credits_delta: 153.5,
                metadata: {
                    source: 'trial_credit_carryover'
                }
            },
            {
                entry_type: 'usage_debit',
                credit_pool: 'topup_pool',
                credits_delta: -30,
                metadata: null
            },
            {
                entry_type: 'usage_debit',
                credit_pool: 'mixed',
                credits_delta: -20,
                metadata: {
                    topup_debit: 16.5
                }
            }
        ])

        await expect(getOrganizationTopupStatusSummary('org_123', supabase)).resolves.toEqual({
            consumedTopupCreditsTotal: 46.5,
            hasTrialCreditCarryover: true
        })
        expect(spies.fromMock).toHaveBeenCalledWith('organization_credit_ledger')
        expect(spies.selectMock).toHaveBeenCalledWith('entry_type, credit_pool, credits_delta, metadata')
        expect(spies.eqOrganizationMock).toHaveBeenCalledWith('organization_id', 'org_123')
        expect(spies.inEntryTypeMock).toHaveBeenCalledWith('entry_type', ['usage_debit', 'adjustment'])
        expect(spies.inCreditPoolMock).toHaveBeenCalledWith('credit_pool', ['topup_pool', 'mixed'])
    })
})
