import { describe, expect, it } from 'vitest'

import { getRegisterConsentLabelClasses, getRegisterConsentTextClasses } from '@/components/auth/registerConsentStyles'

describe('register consent styles', () => {
    it('keeps consent row compact on desktop while allowing mobile wrapping', () => {
        const labelClasses = getRegisterConsentLabelClasses()
        const textClasses = getRegisterConsentTextClasses()

        expect(labelClasses).toContain('sm:items-center')
        expect(textClasses).toContain('sm:whitespace-nowrap')
        expect(textClasses).toContain('leading-snug')
    })
})
