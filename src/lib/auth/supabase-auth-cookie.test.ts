import { describe, expect, it } from 'vitest'
import { hasSupabaseAuthCookie, isSupabaseAuthCookieName } from '@/lib/auth/supabase-auth-cookie'

describe('isSupabaseAuthCookieName', () => {
    it('matches the canonical Supabase auth cookie name', () => {
        expect(isSupabaseAuthCookieName('sb-abc123-auth-token')).toBe(true)
    })

    it('matches chunked Supabase auth cookie names', () => {
        expect(isSupabaseAuthCookieName('sb-abc123-auth-token.0')).toBe(true)
    })

    it('ignores non-auth Supabase cookies', () => {
        expect(isSupabaseAuthCookieName('sb-abc123-refresh-token')).toBe(false)
        expect(isSupabaseAuthCookieName('next-intl-locale')).toBe(false)
    })
})

describe('hasSupabaseAuthCookie', () => {
    it('returns true when any auth cookie exists', () => {
        expect(hasSupabaseAuthCookie([
            { name: 'next-intl-locale' },
            { name: 'sb-abc123-auth-token.0' }
        ])).toBe(true)
    })

    it('returns false when no auth cookie exists', () => {
        expect(hasSupabaseAuthCookie([
            { name: 'next-intl-locale' },
            { name: 'app-theme' }
        ])).toBe(false)
    })
})
