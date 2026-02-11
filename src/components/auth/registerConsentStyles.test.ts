import { describe, expect, it } from 'vitest'

import {
    getRegisterConsentLabelClasses,
    getRegisterConsentLinkClasses,
    getRegisterConsentTextClasses,
} from '@/components/auth/registerConsentStyles'

describe('register consent styles', () => {
    it('uses readable consent typography while allowing mobile wrapping', () => {
        const labelClasses = getRegisterConsentLabelClasses()
        const textClasses = getRegisterConsentTextClasses()

        expect(labelClasses).toContain('text-sm')
        expect(labelClasses).toContain('text-gray-700')
        expect(textClasses).toContain('sm:whitespace-nowrap')
        expect(textClasses).toContain('leading-snug')
    })

    it('uses underlined style for clickable consent links', () => {
        const linkClasses = getRegisterConsentLinkClasses()

        expect(linkClasses).toContain('underline')
        expect(linkClasses).toContain('decoration-1')
    })
})
