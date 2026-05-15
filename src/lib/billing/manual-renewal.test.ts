import { describe, expect, it, vi } from 'vitest'
import { renewDueManualAdminSubscription } from '@/lib/billing/manual-renewal'

describe('manual admin billing renewal helper', () => {
    it('calls the manual renewal RPC before billing state is read', async () => {
        const rpc = vi.fn(async () => ({
            data: {
                status: 'renewed',
                renewed_periods: 1
            },
            error: null
        }))

        const result = await renewDueManualAdminSubscription({
            organizationId: 'org_1',
            supabase: { rpc }
        })

        expect(rpc).toHaveBeenCalledWith('renew_due_manual_admin_subscription', {
            target_organization_id: 'org_1'
        })
        expect(result).toEqual({
            status: 'renewed',
            renewedPeriods: 1
        })
    })

    it('preserves the Supabase client context when invoking rpc', async () => {
        const supabase = {
            rest: { available: true },
            rpc: vi.fn(function (
                this: { rest?: unknown },
                functionName: string,
                args: Record<string, unknown>
            ) {
                if (!this?.rest) {
                    throw new TypeError("Cannot read properties of undefined (reading 'rest')")
                }

                return Promise.resolve({
                    data: {
                        status: 'not_due',
                        renewed_periods: 0
                    },
                    error: null
                })
            })
        }

        const result = await renewDueManualAdminSubscription({
            organizationId: 'org_1',
            supabase
        })

        expect(supabase.rpc).toHaveBeenCalledWith('renew_due_manual_admin_subscription', {
            target_organization_id: 'org_1'
        })
        expect(result).toEqual({
            status: 'not_due',
            renewedPeriods: 0
        })
    })

    it('does not block billing reads when the RPC has not been deployed yet', async () => {
        const rpc = vi.fn(async () => ({
            data: null,
            error: { code: 'PGRST202' }
        }))

        const result = await renewDueManualAdminSubscription({
            organizationId: 'org_1',
            supabase: { rpc }
        })

        expect(result).toEqual({
            status: 'not_available',
            renewedPeriods: 0
        })
    })
})
