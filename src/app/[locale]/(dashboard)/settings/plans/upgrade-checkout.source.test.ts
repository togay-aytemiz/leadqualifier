import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const UPGRADE_CHECKOUT_PAGE_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/upgrade-checkout/[recordId]/page.tsx'
)

describe('upgrade checkout page source guard', () => {
    it('passes the saved iyzico checkout page url into the shared embed fallback', () => {
        expect(fs.existsSync(UPGRADE_CHECKOUT_PAGE_PATH)).toBe(true)

        const source = fs.existsSync(UPGRADE_CHECKOUT_PAGE_PATH)
            ? fs.readFileSync(UPGRADE_CHECKOUT_PAGE_PATH, 'utf8')
            : ''

        expect(source).toContain(".from('credit_purchase_orders')")
        expect(source).toContain('checkout_page_url')
        expect(source).toContain('checkoutPageUrl={checkoutPageUrl}')
    })
})
