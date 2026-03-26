import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PREMIUM_PRIORITY_MIGRATION_PATH = path.join(
    process.cwd(),
    'supabase/migrations/00099_premium_usage_debits_topup_first.sql'
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
})
