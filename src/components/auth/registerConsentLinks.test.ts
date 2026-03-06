import { describe, expect, it } from 'vitest'

import { getRegisterConsentLinks } from '@/components/auth/registerConsentLinks'

describe('register consent links', () => {
    it('opens locale-aware terms, privacy, and kvkk pages in a new tab', () => {
        const trLinks = getRegisterConsentLinks('tr')
        const enLinks = getRegisterConsentLinks('en')

        expect(trLinks.terms.href).toBe('https://askqualy.com/terms')
        expect(trLinks.privacy.href).toBe('https://askqualy.com/privacy')
        expect(trLinks.kvkk.href).toBe('https://askqualy.com/kvkk')
        expect(enLinks.terms.href).toBe('https://askqualy.com/en/terms')
        expect(enLinks.privacy.href).toBe('https://askqualy.com/en/privacy')
        expect(enLinks.kvkk.href).toBe('https://askqualy.com/en/kvkk')
        expect(trLinks.terms.target).toBe('_blank')
        expect(trLinks.privacy.target).toBe('_blank')
        expect(trLinks.kvkk.target).toBe('_blank')
        expect(trLinks.terms.rel).toBe('noopener noreferrer')
        expect(trLinks.privacy.rel).toBe('noopener noreferrer')
        expect(trLinks.kvkk.rel).toBe('noopener noreferrer')
    })
})
