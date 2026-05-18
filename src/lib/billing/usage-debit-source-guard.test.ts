import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PREMIUM_PRIORITY_MIGRATION_PATH = path.join(
    process.cwd(),
    'supabase/migrations/00102_reassert_premium_usage_debits_topup_first.sql'
)
const EMBEDDING_CREDIT_COST_MIGRATION_PATH = path.join(
    process.cwd(),
    'supabase/migrations/00120_embedding_credit_cost.sql'
)

describe('premium usage debit source guard', () => {
    it('keeps carry-over or extra credits ahead of the monthly package during premium usage debits', () => {
        expect(fs.existsSync(PREMIUM_PRIORITY_MIGRATION_PATH)).toBe(true)

        const source = fs.readFileSync(PREMIUM_PRIORITY_MIGRATION_PATH, 'utf8')

        expect(source).toContain('topup_debit := LEAST(account_row.topup_credit_balance, debit);')
        expect(source).toContain('package_debit := GREATEST(0, debit - topup_debit);')
        expect(source.indexOf('topup_debit := LEAST(account_row.topup_credit_balance, debit);')).toBeLessThan(
            source.indexOf('package_debit := GREATEST(0, debit - topup_debit);')
        )
    })

    it('uses category and model aware credit costs for text embedding usage debits', () => {
        expect(fs.existsSync(EMBEDDING_CREDIT_COST_MIGRATION_PATH)).toBe(true)

        const source = fs.readFileSync(EMBEDDING_CREDIT_COST_MIGRATION_PATH, 'utf8')

        expect(source).toContain('CREATE OR REPLACE FUNCTION public.compute_ai_usage_credit_cost')
        expect(source).toContain("normalized_category = 'embedding'")
        expect(source).toContain("normalized_model = 'text-embedding-3-small'")
        expect(source).toContain('debit := public.compute_ai_usage_credit_cost(NEW.category, NEW.model, NEW.input_tokens, NEW.output_tokens);')
        expect(source).toContain('credit_debit := GREATEST(0, public.compute_ai_usage_credit_cost(NEW.category, NEW.model, NEW.input_tokens, NEW.output_tokens));')
    })
})
