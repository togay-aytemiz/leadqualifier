import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const MIGRATION_PATH = path.resolve(
    process.cwd(),
    'supabase/migrations/00122_demo_chat_channel.sql'
)

describe('demo chat channel migration source', () => {
    it('adds demo_chat to conversation platform constraints', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain("'demo_chat'")
        expect(source).toMatch(/platform.*demo_chat/s)
    })

    it('creates a slug mapping table scoped to organizations', () => {
        const source = fs.readFileSync(MIGRATION_PATH, 'utf8')

        expect(source).toContain('create table if not exists public.demo_chat_channels')
        expect(source).toContain('organization_id uuid not null references public.organizations')
        expect(source).toContain('slug text not null unique')
        expect(source).toContain('enabled boolean not null default true')
    })
})
