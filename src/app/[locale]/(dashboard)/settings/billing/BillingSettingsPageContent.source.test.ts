import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const BILLING_SETTINGS_PAGE_CONTENT_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/billing/BillingSettingsPageContent.tsx'
)

describe('billing settings page source guard', () => {
    it('keeps billing settings focused on usage and ledger instead of plan billing controls', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).not.toContain(".from('organization_billing_profiles')")
        expect(source).not.toContain('BillingInformationCard')
        expect(source).not.toContain('buildBillingHistoryRows')
    })

    it('resolves package grants written with subscription_record_id metadata', () => {
        expect(fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(BILLING_SETTINGS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(BILLING_SETTINGS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("readString(metadata, 'subscription_record_id')")
    })
})
