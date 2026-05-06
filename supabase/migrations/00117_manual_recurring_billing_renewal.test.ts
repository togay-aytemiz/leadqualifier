import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/migrations/00117_manual_recurring_billing_renewal.sql', 'utf8')

describe('manual recurring billing renewal migration', () => {
    it('adds an idempotent manual-admin renewal RPC for active manual subscriptions', () => {
        expect(source).toContain('CREATE OR REPLACE FUNCTION public.renew_due_manual_admin_subscription')
        expect(source).toContain("provider = 'manual_admin'")
        expect(source).toContain("status IN ('active', 'past_due')")
        expect(source).toContain("metadata->>'source' = 'manual_admin_recurring_renewal'")
        expect(source).toContain("monthly_package_credit_used = 0")
        expect(source).toContain("entry_type = 'package_grant'")
    })

    it('treats manual subscriptions as auto-renewing unless explicitly canceled', () => {
        expect(source).toContain("COALESCE((subscription_metadata->>'auto_renew')::BOOLEAN, TRUE)")
        expect(source).toContain("COALESCE((subscription_metadata->>'cancel_at_period_end')::BOOLEAN, FALSE) IS FALSE")
    })
})
