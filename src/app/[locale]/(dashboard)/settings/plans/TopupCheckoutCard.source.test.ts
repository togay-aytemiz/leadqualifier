import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TOPUP_CHECKOUT_CARD_PATH = path.join(
  process.cwd(),
  'src/app/[locale]/(dashboard)/settings/plans/TopupCheckoutCard.tsx'
)

describe('topup checkout card source guard', () => {
  it('keeps VAT and conversation-range copy only inside the top-up modal, not the outer card', () => {
    expect(fs.existsSync(TOPUP_CHECKOUT_CARD_PATH)).toBe(true)

    const source = fs.existsSync(TOPUP_CHECKOUT_CARD_PATH)
      ? fs.readFileSync(TOPUP_CHECKOUT_CARD_PATH, 'utf8')
      : ''

    expect(source.match(/tPlans\('topups\.vatIncluded'\)/g)).toHaveLength(1)
    expect(source.match(/tPlans\('topups\.conversationRangeDisclaimer'\)/g)).toHaveLength(1)
  })

  it('submits top-up interest through the sales-led request flow', () => {
    const source = fs.existsSync(TOPUP_CHECKOUT_CARD_PATH)
      ? fs.readFileSync(TOPUP_CHECKOUT_CARD_PATH, 'utf8')
      : ''

    expect(source).toContain("name=\"requestType\"")
    expect(source).toContain("value=\"topup\"")
    expect(source).toContain("tPlans('purchaseRequest.modal.submit')")
    expect(source).not.toContain('CheckoutLegalConsentModal')
  })
})
