import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('supabase/migrations/00126_ai_dictionary_entries.sql', 'utf8')

describe('00126 AI dictionary entries migration', () => {
    it('creates organization-scoped dictionary entries with multiple meanings', () => {
        expect(source).toContain('create table if not exists public.organization_ai_dictionary_entries')
        expect(source).toContain('organization_id uuid not null references public.organizations')
        expect(source).toContain('term text not null')
        expect(source).toContain('normalized_term text not null')
        expect(source).toContain("meanings text[] not null default '{}'")
        expect(source).toContain('enabled boolean not null default true')
        expect(source).toContain('(organization_id, normalized_term)')
    })

    it('protects the table with organization RLS policies', () => {
        expect(source).toContain('enable row level security')
        expect(source).toContain('Users can view org AI dictionary entries')
        expect(source).toContain('Org admins can manage AI dictionary entries')
        expect(source).toContain('organization_id in (select get_user_organizations(auth.uid()))')
        expect(source).toContain('is_org_admin(organization_id, auth.uid())')
        expect(source).toContain('is_system_admin_secure()')
    })
})
