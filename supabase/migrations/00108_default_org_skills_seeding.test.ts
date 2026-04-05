import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.resolve(
    process.cwd(),
    'supabase/migrations/00108_seed_default_system_skills_on_owner_membership.sql'
)

describe('default org skill seeding migration source', () => {
    it('seeds localized default system skills from the owner membership path', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('CREATE OR REPLACE FUNCTION public.seed_default_system_skills(')
        expect(source).toContain("NEW.role <> 'owner'")
        expect(source).toContain('JOIN auth.users AS auth_user')
        expect(source).toContain("raw_user_meta_data->>'locale'")
        expect(source).toContain("billing_region = 'INTL'")
        expect(source).toContain('CREATE TRIGGER on_organization_owner_created_seed_default_skills')
    })

    it('backfills existing organizations that missed create-time default skill seeding', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('FOR existing_org IN')
        expect(source).toContain('PERFORM public.seed_default_system_skills(')
    })
})
