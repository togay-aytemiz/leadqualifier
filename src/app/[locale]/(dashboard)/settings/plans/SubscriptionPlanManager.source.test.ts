import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SUBSCRIPTION_PLAN_MANAGER_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/SubscriptionPlanManager.tsx'
)

describe('subscription plan manager source guard', () => {
    it('keeps the downgrade CTA copy clean and renders the period-end hint in amber text', () => {
        expect(fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)
            ? fs.readFileSync(SUBSCRIPTION_PLAN_MANAGER_PATH, 'utf8')
            : ''

        expect(source).toContain("tPlans('packageCatalog.planModal.downgradeContinue')")
        expect(source).toContain("text-[11px] text-amber-700")
    })

    it('wires saved-payment-method copy and update action into the direct upgrade modal', () => {
        expect(fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)
            ? fs.readFileSync(SUBSCRIPTION_PLAN_MANAGER_PATH, 'utf8')
            : ''

        expect(source).toContain("savedPaymentMethodLabel: tPlans('checkoutLegal.details.savedPaymentMethodLabel')")
        expect(source).toContain("label: tPlans('checkoutLegal.updatePaymentMethodInlineAction')")
    })

    it('uses a dynamic charge-aware CTA label for direct plan changes', () => {
        expect(fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)
            ? fs.readFileSync(SUBSCRIPTION_PLAN_MANAGER_PATH, 'utf8')
            : ''

        expect(source).toContain('resolveSubscriptionCheckoutContinueLabel')
        expect(source).toContain("chargeLabel: ({ price }) => tPlans('checkoutLegal.continueDirectActionWithCharge', { price })")
    })

    it('renders the active package summary inside the same card instead of a separate manager header', () => {
        expect(fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)
            ? fs.readFileSync(SUBSCRIPTION_PLAN_MANAGER_PATH, 'utf8')
            : ''

        expect(source).toContain("tPlans('packageCatalog.currentPackageLabel')")
        expect(source).toContain("tPlans('packageCatalog.packageCreditsValue'")
        expect(source).not.toContain("tPlans('packageCatalog.manager.title')")
        expect(source).not.toContain("tPlans('packageCatalog.manager.description')")
    })

    it('surfaces VAT-inclusive copy on subscribed pricing surfaces', () => {
        expect(fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)
            ? fs.readFileSync(SUBSCRIPTION_PLAN_MANAGER_PATH, 'utf8')
            : ''

        expect(source).toContain("tPlans('packageCatalog.vatIncluded')")
        expect(source).toContain("tPlans('packageCatalog.conversationRangeDisclaimer')")
    })

    it('renders management actions as text links instead of a primary filled button', () => {
        expect(fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_PLAN_MANAGER_PATH)
            ? fs.readFileSync(SUBSCRIPTION_PLAN_MANAGER_PATH, 'utf8')
            : ''

        expect(source).toContain("className=\"flex flex-wrap items-center gap-x-5 gap-y-2 text-sm\"")
        expect(source).toContain("tPlans('packageCatalog.manager.manageCtaPrimary')")
        expect(source).not.toContain('min-w-[200px] items-center justify-center rounded-lg bg-[#242A40]')
    })
})
