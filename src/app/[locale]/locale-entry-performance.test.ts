import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const ENTRY_PAGE_PATH = path.resolve(process.cwd(), 'src/app/[locale]/page.tsx')

describe('locale entry performance', () => {
    it('does not block app entry on onboarding state reads', () => {
        const source = fs.readFileSync(ENTRY_PAGE_PATH, 'utf8')

        expect(source).not.toContain('getOrganizationOnboardingState')
        expect(source).toContain('resolveDefaultHomeRoute(orgContext)')
        expect(source).not.toContain('resolveDefaultHomeRoute(orgContext, { onboarding')
    })
})
