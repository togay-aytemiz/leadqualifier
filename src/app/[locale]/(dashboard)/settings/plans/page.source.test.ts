import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PLANS_PAGE_CONTENT_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/PlansSettingsPageContent.tsx'
)

describe('plans page source guard', () => {
    it('surfaces total remaining credits in the current-plan status section', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('snapshot.totalRemainingCredits')
    })

    it('moves billing region persistence out of the blocking GET render path', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("import { after } from 'next/server'")
        expect(source).toContain('after(async () => {')
        expect(source).not.toMatch(/const \{ error: billingRegionUpdateError \} = await supabase[\s\S]*?\.update\(\{/)
    })

    it('keeps one-time credit purchase ahead of the custom-package contact CTA', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        const topupCardIndex = source.indexOf('<TopupCheckoutCard')
        const customPackageIndex = source.indexOf("tPlans('packageCatalog.customPackage.title')")

        expect(topupCardIndex).toBeGreaterThan(-1)
        expect(customPackageIndex).toBeGreaterThan(-1)
        expect(topupCardIndex).toBeLessThan(customPackageIndex)
        expect(source).toMatch(/border border-gray-300[\s\S]*bg-white[\s\S]*text-gray-700/)
    })

    it('wires payment-recovery actions and query states into the plans page source', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("payment_recovery_action?: string")
        expect(source).toContain("payment_recovery_status?: string")
        expect(source).toContain('buildPaymentRecoveryRedirect')
        expect(source).toContain('beginSubscriptionPaymentMethodUpdate')
        expect(source).toContain('retryFailedSubscriptionPayment')
        expect(source).toContain('paymentRecoveryState=')
        expect(source).toContain('retryPaymentAction=')
        expect(source).toContain('updatePaymentMethodAction=')
    })

    it('loads billing profile data and renders billing info/history inside plans', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain(".from('organization_billing_profiles')")
        expect(source).toContain('PlansBillingInformationCard')
        expect(source).toContain('buildBillingHistoryRows')
    })

    it('defaults billing country to Türkiye only for Turkish locale when no saved country exists', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain("savedCountry === 'Turkey'")
        expect(source).toContain("return locale.toLowerCase().startsWith('tr') ? 'Türkiye' : ''")
    })

    it('keeps monthly package selection as a separate section only when there is no managed subscription', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('{!isManagedSubscriptionMembership && (')
        expect(source).toContain("title={tPlans('packageCatalog.title')}")
    })

    it('renders billing info below the top-up section', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        const topupsSectionIndex = source.indexOf("title={tPlans('topups.sectionTitle')}")
        const billingInfoSectionIndex = source.indexOf("title={tPlans('billingInfo.sectionTitle')}")

        expect(topupsSectionIndex).toBeGreaterThan(-1)
        expect(billingInfoSectionIndex).toBeGreaterThan(-1)
        expect(billingInfoSectionIndex).toBeGreaterThan(topupsSectionIndex)
    })

    it('hides the old membership status card for managed subscriptions and places package management before premium credit cards', () => {
        expect(fs.existsSync(PLANS_PAGE_CONTENT_PATH)).toBe(true)

        const source = fs.existsSync(PLANS_PAGE_CONTENT_PATH)
            ? fs.readFileSync(PLANS_PAGE_CONTENT_PATH, 'utf8')
            : ''

        expect(source).toContain('{!isManagedSubscriptionMembership && (')
        expect(source).toContain("{tPlans('status.membershipLabel')}")

        const managerIndex = source.indexOf('<SubscriptionPlanManager')
        const totalCreditsIndex = source.indexOf("tPlans('status.totalCreditsTitle')")

        expect(managerIndex).toBeGreaterThan(-1)
        expect(totalCreditsIndex).toBeGreaterThan(-1)
        expect(managerIndex).toBeLessThan(totalCreditsIndex)
    })
})
