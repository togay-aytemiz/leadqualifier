interface RegisterConsentLink {
    href: string
    target: '_blank'
    rel: 'noopener noreferrer'
}

interface RegisterConsentLinks {
    terms: RegisterConsentLink
    privacy: RegisterConsentLink
}

const EXTERNAL_LINK_TARGET = '_blank'
const EXTERNAL_LINK_REL = 'noopener noreferrer'

function createExternalLink(href: string): RegisterConsentLink {
    return {
        href,
        target: EXTERNAL_LINK_TARGET,
        rel: EXTERNAL_LINK_REL,
    }
}

export function getRegisterConsentLinks(): RegisterConsentLinks {
    return {
        terms: createExternalLink('https://askqualy.com/terms'),
        privacy: createExternalLink('https://askqualy.com/privacy'),
    }
}
