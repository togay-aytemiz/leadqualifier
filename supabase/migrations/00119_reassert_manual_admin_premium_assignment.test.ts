import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync('supabase/migrations/00119_reassert_manual_admin_premium_assignment.sql', 'utf8')

describe('manual admin premium assignment reassertion migration', () => {
    it('prevents premium activation without a positive package credit grant', () => {
        expect(source).toContain('CREATE OR REPLACE FUNCTION public.admin_assign_premium')
        expect(source).toContain('monthly_credits_safe := GREATEST(0, COALESCE(monthly_credits, 0))')
        expect(source).toContain('IF monthly_credits_safe <= 0 THEN')
        expect(source).toContain("RAISE EXCEPTION 'Monthly credits must be greater than zero'")
    })

    it('writes package credits and renewal metadata from the selected manual plan', () => {
        expect(source).toContain('monthly_package_credit_limit = monthly_credits_safe')
        expect(source).toContain('monthly_package_credit_used = 0')
        expect(source).toContain("'auto_renew', TRUE")
        expect(source).toContain("'monthly_credits', monthly_credits_safe")
        expect(source).toContain("'package_grant'")
        expect(source).toContain("'subscription_record_id', subscription_id")
    })
})
