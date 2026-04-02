import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const CHECKOUT_LEGAL_CONSENT_MODAL_PATH = path.join(
    process.cwd(),
    'src/app/[locale]/(dashboard)/settings/plans/CheckoutLegalConsentModal.tsx'
)

describe('checkout legal consent modal source guard', () => {
    it('wires the primary CTA to form pending state for direct upgrades', () => {
        expect(fs.existsSync(CHECKOUT_LEGAL_CONSENT_MODAL_PATH)).toBe(true)

        const source = fs.existsSync(CHECKOUT_LEGAL_CONSENT_MODAL_PATH)
            ? fs.readFileSync(CHECKOUT_LEGAL_CONSENT_MODAL_PATH, 'utf8')
            : ''

        expect(source).toContain('useFormStatus')
        expect(source).toContain("tPlans('checkoutLegal.processing')")
        expect(source).toContain('disabled={pending || !canSubmit}')
    })
})
