import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.join(
    process.cwd(),
    'supabase/migrations/00121_reconcile_embedding_credit_overcharges.sql'
)

describe('00121_reconcile_embedding_credit_overcharges migration', () => {
    it('refunds current-period embedding overcharges into billing accounts and ledger once', () => {
        expect(fs.existsSync(MIGRATION_PATH)).toBe(true)

        const source = fs.existsSync(MIGRATION_PATH)
            ? fs.readFileSync(MIGRATION_PATH, 'utf8')
            : ''

        expect(source).toContain('public.compute_ai_usage_credit_cost')
        expect(source).toContain("lower(btrim(COALESCE(usage_rows.category, ''))) = 'embedding'")
        expect(source).toContain('current_period_start')
        expect(source).toContain("accounts.membership_state = 'premium_active'")
        expect(source).toContain("accounts.lock_reason <> 'package_credits_exhausted'")
        expect(source).toContain('accounts.monthly_package_credit_used < accounts.monthly_package_credit_limit')
        expect(source).toContain('monthly_package_credit_used = GREATEST(0, accounts.monthly_package_credit_used - organization_refunds.package_refund)')
        expect(source).toContain('topup_credit_balance = accounts.topup_credit_balance + organization_refunds.topup_refund')
        expect(source).toContain('INSERT INTO public.organization_credit_ledger')
        expect(source).toContain("'adjustment'::public.billing_credit_ledger_type")
        expect(source).toContain("'Text embedding credit correction'")
        expect(source).toContain("'embedding_credit_cost_reconciliation'")
        expect(source).toContain('NOT EXISTS')
    })

    it('uses original debit allocation metadata to refund package and top-up pools correctly', () => {
        const source = fs.existsSync(MIGRATION_PATH)
            ? fs.readFileSync(MIGRATION_PATH, 'utf8')
            : ''

        expect(source).toContain("ledger.metadata->>'package_debit'")
        expect(source).toContain("ledger.metadata->>'topup_debit'")
        expect(source).toContain('original_package_debit - LEAST(original_package_debit')
        expect(source).toContain('original_topup_debit - LEAST(original_topup_debit')
        expect(source).toContain("'mixed'::public.billing_credit_pool_type")
    })
})
