import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const source = readFileSync(
    'supabase/migrations/20260604131450_ignore_disposable_email_domains_trial_identity.sql',
    'utf8'
)

describe('disposable email domains trial identity migration', () => {
    it('keeps shared disposable inbox domains out of email-domain trial fingerprints', () => {
        expect(source).toContain('CREATE OR REPLACE FUNCTION public.normalize_trial_identity_email_domain')
        expect(source).toContain("'yopmail.com'")
        expect(source).toContain("'yopmail.fr'")
        expect(source).toContain("'mailinator.com'")
        expect(source).toContain("'tempmail.com'")
        expect(source).toContain("'10minutemail.com'")
        expect(source).toContain("'guerrillamail.com'")
    })
})
