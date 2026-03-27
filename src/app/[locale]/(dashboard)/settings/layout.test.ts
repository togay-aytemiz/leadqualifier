import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SETTINGS_LAYOUT_PATH = path.resolve(process.cwd(), 'src/app/[locale]/(dashboard)/settings/layout.tsx')

describe('settings layout source', () => {
    it('keeps non-critical pending count off the server navigation critical path', () => {
        const source = fs.readFileSync(SETTINGS_LAYOUT_PATH, 'utf8')

        expect(source).not.toContain('getPendingOfferingProfileSuggestionCount')
        expect(source).toContain('activeOrganizationId={orgContext?.activeOrganizationId ?? null}')
    })

    it('keeps billing-lock hydration off the server critical path for settings navigation', () => {
        const source = fs.readFileSync(SETTINGS_LAYOUT_PATH, 'utf8')

        expect(source).not.toContain('getOrganizationBillingSnapshot')
        expect(source).not.toContain('resolveWorkspaceAccessState')
        expect(source).not.toContain('billingOnlyMode={')
    })
})
