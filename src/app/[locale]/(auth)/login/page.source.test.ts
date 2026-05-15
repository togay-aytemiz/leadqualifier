import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const FILE_PATH = path.resolve(
    process.cwd(),
    'src/app/[locale]/(auth)/login/page.tsx'
)

describe('login page auth callback handoff', () => {
    it('redirects Supabase confirmation code URLs through the auth callback route', () => {
        const source = fs.readFileSync(FILE_PATH, 'utf8')

        expect(source).toContain('searchParams')
        expect(source).toContain('/api/auth/callback')
        expect(source).toContain('code')
        expect(source).toContain('redirect(')
    })
})
