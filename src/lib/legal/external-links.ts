export type ExternalLegalDocumentId =
    | 'terms'
    | 'privacy'
    | 'kvkk'
    | 'pre-information'
    | 'distance-sales-agreement'
    | 'cancellation-refund'
    | 'subscription-trial'

export interface ExternalLegalLink {
    href: string
    target: '_blank'
    rel: 'noopener noreferrer'
}

const EXTERNAL_LINK_TARGET = '_blank'
const EXTERNAL_LINK_REL = 'noopener noreferrer'
const LEGAL_BASE_URL = 'https://askqualy.com'

function normalizeLegalLocale(locale: string | null | undefined): 'tr' | 'en' {
    return (locale ?? '').toLowerCase().startsWith('en') ? 'en' : 'tr'
}

export function buildExternalLegalUrl(
    documentId: ExternalLegalDocumentId,
    locale: string | null | undefined
) {
    const normalizedLocale = normalizeLegalLocale(locale)
    const localePrefix = normalizedLocale === 'en' ? '/en' : ''
    return `${LEGAL_BASE_URL}${localePrefix}/${documentId}`
}

export function createExternalLegalLink(
    documentId: ExternalLegalDocumentId,
    locale: string | null | undefined
): ExternalLegalLink {
    return {
        href: buildExternalLegalUrl(documentId, locale),
        target: EXTERNAL_LINK_TARGET,
        rel: EXTERNAL_LINK_REL
    }
}
