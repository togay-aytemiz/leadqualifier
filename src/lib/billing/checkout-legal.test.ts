import { describe, expect, it } from 'vitest'
import {
    CHECKOUT_LEGAL_ACCEPTED_VALUE,
    CHECKOUT_LEGAL_FORM_FIELD_NAMES,
    getCheckoutLegalDocuments,
    readCheckoutLegalConsent
} from './checkout-legal'

describe('checkout legal document mapping', () => {
    it('returns the full required document set for subscription checkout', () => {
        expect(getCheckoutLegalDocuments('subscription')).toEqual([
            { id: 'pre-information', labelKey: 'preInformation', required: true },
            { id: 'distance-sales-agreement', labelKey: 'distanceSalesAgreement', required: true },
            { id: 'terms', labelKey: 'terms', required: true },
            { id: 'cancellation-refund', labelKey: 'cancellationRefund', required: false },
            { id: 'kvkk', labelKey: 'kvkk', required: false }
        ])
    })

    it('omits subscription-trial for one-time top-up checkout', () => {
        expect(getCheckoutLegalDocuments('topup')).toEqual([
            { id: 'pre-information', labelKey: 'preInformation', required: true },
            { id: 'distance-sales-agreement', labelKey: 'distanceSalesAgreement', required: true },
            { id: 'terms', labelKey: 'terms', required: true },
            { id: 'cancellation-refund', labelKey: 'cancellationRefund', required: false },
            { id: 'kvkk', labelKey: 'kvkk', required: false }
        ])
    })

    it('requires both legal consent checkboxes before checkout can continue', () => {
        const formData = new FormData()
        formData.set(CHECKOUT_LEGAL_FORM_FIELD_NAMES.requiredDocs, CHECKOUT_LEGAL_ACCEPTED_VALUE)
        formData.set(CHECKOUT_LEGAL_FORM_FIELD_NAMES.immediateStart, CHECKOUT_LEGAL_ACCEPTED_VALUE)

        expect(readCheckoutLegalConsent(formData)).toEqual({
            acceptedRequiredDocs: true,
            acceptedImmediateStart: true,
            isComplete: true
        })
    })

    it('treats missing or tampered legal consent values as incomplete', () => {
        const formData = new FormData()
        formData.set(CHECKOUT_LEGAL_FORM_FIELD_NAMES.requiredDocs, CHECKOUT_LEGAL_ACCEPTED_VALUE)
        formData.set(CHECKOUT_LEGAL_FORM_FIELD_NAMES.immediateStart, 'on')

        expect(readCheckoutLegalConsent(formData)).toEqual({
            acceptedRequiredDocs: true,
            acceptedImmediateStart: false,
            isComplete: false
        })
    })
})
