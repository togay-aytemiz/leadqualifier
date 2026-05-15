import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.resolve(
    process.cwd(),
    'supabase/migrations/00118_default_greeting_skill.sql'
)

describe('default greeting skill migration source', () => {
    it('backfills an editable active greeting skill for existing organizations', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('CREATE OR REPLACE FUNCTION public.seed_default_greeting_skill(')
        expect(source).toContain('Karşılama ve İlk Mesaj')
        expect(source).toContain('/start')
        expect(source).toContain('requires_human_handover')
        expect(source).toContain('FALSE')
        expect(source).toContain('PERFORM public.seed_default_greeting_skill(')
    })

    it('keeps future owner-created organizations seeded with the greeting skill too', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('CREATE OR REPLACE FUNCTION public.handle_new_org_owner_default_skills()')
        expect(source).toContain('PERFORM public.seed_default_system_skills(NEW.organization_id, owner_locale);')
        expect(source).toContain('PERFORM public.seed_default_greeting_skill(NEW.organization_id, owner_locale);')
    })
})
