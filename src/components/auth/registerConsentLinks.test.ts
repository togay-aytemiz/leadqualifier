import { describe, expect, it } from 'vitest'

import { getRegisterConsentLinks } from '@/components/auth/registerConsentLinks'

describe('register consent links', () => {
    it('opens terms and privacy pages in a new tab', () => {
        const links = getRegisterConsentLinks()

        expect(links.terms.href).toBe('https://askqualy.com/terms')
        expect(links.privacy.href).toBe('https://askqualy.com/privacy')
        expect(links.terms.target).toBe('_blank')
        expect(links.privacy.target).toBe('_blank')
        expect(links.terms.rel).toBe('noopener noreferrer')
        expect(links.privacy.rel).toBe('noopener noreferrer')
    })
})
