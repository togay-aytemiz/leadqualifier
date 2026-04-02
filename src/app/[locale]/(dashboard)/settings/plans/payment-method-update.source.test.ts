import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const PAYMENT_METHOD_UPDATE_PAGE_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/payment-method-update/[recordId]/page.tsx'
)

describe('payment method update page source guard', () => {
    it('loads card-update checkout form content from subscription metadata', () => {
        expect(fs.existsSync(PAYMENT_METHOD_UPDATE_PAGE_PATH)).toBe(true)

        const source = fs.existsSync(PAYMENT_METHOD_UPDATE_PAGE_PATH)
            ? fs.readFileSync(PAYMENT_METHOD_UPDATE_PAGE_PATH, 'utf8')
            : ''

        expect(source).toContain('card_update_checkout_form_content')
    })

    it('renders localized page guidance around the hosted iyzico form', () => {
        expect(fs.existsSync(PAYMENT_METHOD_UPDATE_PAGE_PATH)).toBe(true)

        const source = fs.existsSync(PAYMENT_METHOD_UPDATE_PAGE_PATH)
            ? fs.readFileSync(PAYMENT_METHOD_UPDATE_PAGE_PATH, 'utf8')
            : ''

        expect(source).toContain("paymentMethodUpdatePage.title")
        expect(source).toContain("paymentMethodUpdatePage.description")
        expect(source).toContain("paymentMethodUpdatePage.backToPlans")
    })
})
