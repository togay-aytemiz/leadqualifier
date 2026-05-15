import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'

const source = readFileSync(
    'src/app/[locale]/(dashboard)/admin/organizations/[id]/page.tsx',
    'utf8'
)

describe('admin organization billing detail source', () => {
    it('shows remaining package and trial credits as the primary card values', () => {
        expect(source).toContain('formatNumber.format(details.organization.billing.packageCreditsRemaining)')
        expect(source).toContain('formatNumber.format(details.organization.billing.trialCreditsRemaining)')
        expect(source).toContain("tAdmin('organizationDetail.billing.usedVsLimit'")
        expect(source).not.toContain(
            '{formatNumber.format(details.organization.billing.packageCreditsUsed)} / {formatNumber.format(details.organization.billing.packageCreditsLimit)}'
        )
        expect(source).not.toContain(
            '{formatNumber.format(details.organization.billing.trialCreditsUsed)} / {formatNumber.format(details.organization.billing.trialCreditsLimit)}'
        )
    })
})
