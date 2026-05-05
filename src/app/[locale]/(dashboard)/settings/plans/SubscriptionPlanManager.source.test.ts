import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const sourcePath = join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx'
)

describe('SubscriptionPlanManager source', () => {
    it('submits plan changes as sales-led purchase requests without checkout legal modal', () => {
        const source = readFileSync(sourcePath, 'utf8')

        expect(source).toContain('name="requestType"')
        expect(source).toContain('value="plan_change"')
        expect(source).toContain('name="planId"')
        expect(source).not.toContain('CheckoutLegalConsentModal')
    })
})
