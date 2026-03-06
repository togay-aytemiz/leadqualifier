import { createExternalLegalLink } from '@/lib/legal/external-links'

interface RegisterConsentLink {
    href: string
    target: '_blank'
    rel: 'noopener noreferrer'
}

interface RegisterConsentLinks {
    terms: RegisterConsentLink
    privacy: RegisterConsentLink
    kvkk: RegisterConsentLink
}

export function getRegisterConsentLinks(locale: string | null | undefined): RegisterConsentLinks {
    return {
        terms: createExternalLegalLink('terms', locale),
        privacy: createExternalLegalLink('privacy', locale),
        kvkk: createExternalLegalLink('kvkk', locale)
    }
}
