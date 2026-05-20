import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync('supabase/migrations/20260520112357_allow_service_role_manual_renewal.sql', 'utf8')

describe('manual renewal service-role migration', () => {
    it('falls back to auth.role for service-role RPC calls', () => {
        expect(source).toContain("auth.role()::TEXT")
        expect(source).toContain("role_claim <> 'service_role'")
    })
})
