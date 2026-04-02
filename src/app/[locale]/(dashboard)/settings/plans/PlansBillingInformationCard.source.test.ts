import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PLANS_BILLING_INFORMATION_CARD_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/PlansBillingInformationCard.tsx'
)

describe('plans billing information card source guard', () => {
    it('uses the plans translation namespace and keeps the wrapper shadow-free', () => {
        expect(fs.existsSync(PLANS_BILLING_INFORMATION_CARD_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_BILLING_INFORMATION_CARD_PATH)
            ? fs.readFileSync(PLANS_BILLING_INFORMATION_CARD_PATH, 'utf8')
            : ''

        expect(source).toContain("useTranslations('billingPlans.billingInfo')")
        expect(source).not.toContain('shadow-sm')
    })

    it('does not duplicate the section title and description inside the inner wrapper', () => {
        expect(fs.existsSync(PLANS_BILLING_INFORMATION_CARD_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_BILLING_INFORMATION_CARD_PATH)
            ? fs.readFileSync(PLANS_BILLING_INFORMATION_CARD_PATH, 'utf8')
            : ''

        expect(source).not.toContain("tBillingInfo('cardTitle')")
        expect(source).not.toContain("tBillingInfo('cardDescription')")
        expect(source).toContain("tBillingInfo('nextBillingDateLabel')")
    })

    it('keeps only the renewal box wrapped while rendering the actions as text links below it', () => {
        expect(fs.existsSync(PLANS_BILLING_INFORMATION_CARD_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_BILLING_INFORMATION_CARD_PATH)
            ? fs.readFileSync(PLANS_BILLING_INFORMATION_CARD_PATH, 'utf8')
            : ''

        expect(source).not.toContain('rounded-xl border border-gray-200 bg-white p-5')
        expect(source).toMatch(/onClick=\{\(\) => setIsHistoryOpen\(true\)\}[\s\S]{0,260}underline-offset-4/)
        expect(source).toMatch(/onClick=\{\(\) => setIsFormOpen\(true\)\}[\s\S]{0,260}underline-offset-4/)
        expect(source).not.toMatch(/onClick=\{\(\) => setIsHistoryOpen\(true\)\}[\s\S]{0,160}variant="secondary"/)
        expect(source).not.toMatch(/onClick=\{\(\) => setIsFormOpen\(true\)\}[\s\S]{0,160}variant="secondary"/)
    })
})
