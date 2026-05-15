import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const GRANT_MIGRATION_PATH = path.resolve(
    process.cwd(),
    'supabase/migrations/00118_explicit_public_data_api_grants.sql'
)

describe('explicit Supabase Data API grants migration', () => {
    it('keeps unauthenticated table access closed while granting authenticated table access', () => {
        const source = fs.readFileSync(GRANT_MIGRATION_PATH, 'utf8')

        expect(source).toContain('TO authenticated')
        expect(source).toContain('TO service_role')
        expect(source).not.toMatch(/ON ALL TABLES IN SCHEMA public\s+TO anon/i)
        expect(source).not.toMatch(/EXECUTE ON ALL FUNCTIONS IN SCHEMA public\s+TO authenticated/i)
        expect(source).toContain('check_signup_trial_rate_limit')
        expect(source).toContain('record_signup_trial_attempt')
        expect(source).toContain('check_trial_business_identity')
    })
})
