import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TOPUP_CHECKOUT_CARD_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx'
)

describe('topup checkout card source guard', () => {
    it('surfaces VAT-inclusive copy for top-up pricing in both card and modal contexts', () => {
        expect(fs.existsSync(TOPUP_CHECKOUT_CARD_PATH)).toBe(true)

        const source = fs.existsSync(TOPUP_CHECKOUT_CARD_PATH)
            ? fs.readFileSync(TOPUP_CHECKOUT_CARD_PATH, 'utf8')
            : ''

        expect(source).toContain("tPlans('topups.vatIncluded')")
        expect(source).toContain("tPlans('topups.conversationRangeDisclaimer')")
    })
})
