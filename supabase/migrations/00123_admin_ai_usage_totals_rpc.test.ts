import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.resolve(process.cwd(), 'supabase/migrations/00123_admin_ai_usage_totals_rpc.sql')

describe('admin AI usage totals RPC migration source', () => {
    it('aggregates usage totals in SQL while enforcing authenticated organization scope', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('CREATE OR REPLACE FUNCTION public.get_admin_ai_usage_totals')
        expect(source).toContain('IF auth.uid() IS NULL THEN')
        expect(source).toContain('is_system_admin_secure()')
        expect(source).toContain('get_user_organizations(auth.uid())')
        expect(source).toContain('public.compute_ai_usage_credit_cost')
        expect(source).toContain('GRANT EXECUTE ON FUNCTION public.get_admin_ai_usage_totals(UUID[], TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated')
    })
})
