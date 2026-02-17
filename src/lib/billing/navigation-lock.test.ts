import { describe, expect, it } from 'vitest'
import { resolveBillingLockedNavItem } from '@/lib/billing/navigation-lock'

describe('resolveBillingLockedNavItem', () => {
    it('keeps item href unchanged when workspace is not locked', () => {
        expect(resolveBillingLockedNavItem(
            { id: 'inbox', href: '/inbox' },
            false
        )).toEqual({
            href: '/inbox',
            isLocked: false
        })
    })

    it('locks non-billing destinations when workspace is locked', () => {
        expect(resolveBillingLockedNavItem(
            { id: 'knowledge', href: '/knowledge' },
            true
        )).toEqual({
            href: '/knowledge',
            isLocked: true
        })
    })

    it('keeps billing pages unlocked when workspace is locked', () => {
        expect(resolveBillingLockedNavItem(
            { id: 'settings-billing', href: '/settings/billing' },
            true
        )).toEqual({
            href: '/settings/billing',
            isLocked: false
        })
    })

    it('rewrites settings destination to plans and keeps it unlocked when workspace is locked', () => {
        expect(resolveBillingLockedNavItem(
            { id: 'settings', href: '/settings/ai' },
            true
        )).toEqual({
            href: '/settings/plans',
            isLocked: false
        })
    })

    it('handles items without href safely', () => {
        expect(resolveBillingLockedNavItem(
            { id: 'section-title' },
            true
        )).toEqual({
            href: undefined,
            isLocked: false
        })
    })
})
