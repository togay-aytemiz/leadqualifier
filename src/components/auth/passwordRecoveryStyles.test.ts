import { describe, expect, it } from 'vitest'

import {
    getPasswordRecoveryInputClasses,
    getPasswordRecoveryLinkClasses,
    getPasswordRecoveryPrimaryButtonClasses,
} from '@/components/auth/passwordRecoveryStyles'

describe('password recovery styles', () => {
    it('uses the same ink-accent focus style as login/register inputs', () => {
        const classes = getPasswordRecoveryInputClasses()

        expect(classes).toContain('focus:border-[#242A40]')
        expect(classes).toContain('focus:ring-[#242A40]/10')
    })

    it('supports icon paddings for password visibility toggles', () => {
        const classes = getPasswordRecoveryInputClasses({ withTrailingIcon: true })

        expect(classes).toContain('pr-10')
    })

    it('uses ink-accent action styles for primary button and links', () => {
        const buttonClasses = getPasswordRecoveryPrimaryButtonClasses()
        const linkClasses = getPasswordRecoveryLinkClasses()

        expect(buttonClasses).toContain('bg-[#242A40]')
        expect(buttonClasses).toContain('hover:bg-[#1B2033]')
        expect(linkClasses).toContain('text-[#242A40]')
        expect(linkClasses).toContain('hover:text-[#1B2033]')
    })
})
