import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const SUBSCRIPTION_CHECKOUT_PAGE_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/subscription-checkout/[recordId]/page.tsx'
)

describe('subscription checkout page source guard', () => {
    it('passes the saved iyzico checkout page url into the shared embed fallback', () => {
        expect(fs.existsSync(SUBSCRIPTION_CHECKOUT_PAGE_PATH)).toBe(true)

        const source = fs.existsSync(SUBSCRIPTION_CHECKOUT_PAGE_PATH)
            ? fs.readFileSync(SUBSCRIPTION_CHECKOUT_PAGE_PATH, 'utf8')
            : ''

        expect(source).toContain(".from('organization_subscription_records')")
        expect(source).toContain('checkout_page_url')
        expect(source).toContain('checkoutPageUrl={checkoutPageUrl}')
    })
})
