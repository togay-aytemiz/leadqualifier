import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TOPUP_CHECKOUT_PAGE_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/topup-checkout/[recordId]/page.tsx'
)

describe('top-up checkout page source guard', () => {
    it('loads hosted checkout html from top-up order metadata and renders the shared embed', () => {
        expect(fs.existsSync(TOPUP_CHECKOUT_PAGE_PATH)).toBe(true)

        const source = fs.existsSync(TOPUP_CHECKOUT_PAGE_PATH)
            ? fs.readFileSync(TOPUP_CHECKOUT_PAGE_PATH, 'utf8')
            : ''

        expect(source).toContain(".from('credit_purchase_orders')")
        expect(source).toContain('checkout_form_content')
        expect(source).toContain('HostedCheckoutEmbed')
    })
})
