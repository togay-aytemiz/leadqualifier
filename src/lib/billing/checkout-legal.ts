import type { ExternalLegalDocumentId } from '@/lib/legal/external-links'

export type CheckoutLegalFlowType = 'subscription' | 'topup'
export const CHECKOUT_LEGAL_ACCEPTED_VALUE = 'accepted'
export const CHECKOUT_LEGAL_FORM_FIELD_NAMES = {
    requiredDocs: 'acceptedRequiredDocs',
    immediateStart: 'acceptedImmediateStart'
} as const

export interface CheckoutLegalDocument {
    id: ExternalLegalDocumentId
    labelKey: 'preInformation' | 'distanceSalesAgreement' | 'terms' | 'cancellationRefund' | 'kvkk'
    required: boolean
}

interface FormDataReader {
    get: (name: string) => FormDataEntryValue | null
}

export interface CheckoutLegalConsentState {
    acceptedRequiredDocs: boolean
    acceptedImmediateStart: boolean
    isComplete: boolean
}

export function getCheckoutLegalDocuments(flowType: CheckoutLegalFlowType): CheckoutLegalDocument[] {
    if (flowType === 'subscription') {
        return [
            { id: 'pre-information', labelKey: 'preInformation', required: true },
            { id: 'distance-sales-agreement', labelKey: 'distanceSalesAgreement', required: true },
            { id: 'terms', labelKey: 'terms', required: true },
            { id: 'cancellation-refund', labelKey: 'cancellationRefund', required: false },
            { id: 'kvkk', labelKey: 'kvkk', required: false }
        ]
    }

    return [
        { id: 'pre-information', labelKey: 'preInformation', required: true },
        { id: 'distance-sales-agreement', labelKey: 'distanceSalesAgreement', required: true },
        { id: 'terms', labelKey: 'terms', required: true },
        { id: 'cancellation-refund', labelKey: 'cancellationRefund', required: false },
        { id: 'kvkk', labelKey: 'kvkk', required: false }
    ]
}

function isAcceptedCheckboxValue(value: FormDataEntryValue | null) {
    return typeof value === 'string' && value.trim() === CHECKOUT_LEGAL_ACCEPTED_VALUE
}

export function readCheckoutLegalConsent(formData: FormDataReader): CheckoutLegalConsentState {
    const acceptedRequiredDocs = isAcceptedCheckboxValue(formData.get(CHECKOUT_LEGAL_FORM_FIELD_NAMES.requiredDocs))
    const acceptedImmediateStart = isAcceptedCheckboxValue(formData.get(CHECKOUT_LEGAL_FORM_FIELD_NAMES.immediateStart))

    return {
        acceptedRequiredDocs,
        acceptedImmediateStart,
        isComplete: acceptedRequiredDocs && acceptedImmediateStart
    }
}
