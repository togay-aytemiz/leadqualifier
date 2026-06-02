import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('supabase/migrations/00125_demo_chat_channel_maintenance.sql', 'utf8')

describe('00125 demo chat channel maintenance migration', () => {
    it('adds a runtime maintenance flag to demo chat channels', () => {
        expect(source).toContain('ALTER TABLE public.demo_chat_channels')
        expect(source).toContain('ADD COLUMN IF NOT EXISTS maintenance_enabled boolean NOT NULL DEFAULT false')
    })
})
