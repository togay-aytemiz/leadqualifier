import { describe, expect, it } from 'vitest'
import { resolveDashboardTypographyVariables } from '@/design/dashboard-typography'

describe('resolveDashboardTypographyVariables', () => {
    it('returns a slightly smaller desktop content scale', () => {
        expect(resolveDashboardTypographyVariables('content')).toMatchObject({
            '--dashboard-content-text-xs': '0.71875rem',
            '--dashboard-content-text-sm': '0.84375rem',
            '--dashboard-content-text-base': '0.9375rem',
            '--dashboard-content-text-lg': '1.0625rem'
        })
    })

    it('returns a slightly larger sidebar scale', () => {
        expect(resolveDashboardTypographyVariables('sidebar')).toMatchObject({
            '--dashboard-sidebar-text-xs': '0.78125rem',
            '--dashboard-sidebar-text-sm': '0.90625rem',
            '--dashboard-sidebar-text-base': '1.03125rem',
            '--dashboard-sidebar-text-lg': '1.15625rem'
        })
    })

    it('includes matching line-height variables for every overridden token', () => {
        const content = resolveDashboardTypographyVariables('content')

        expect(content).toMatchObject({
            '--dashboard-content-text-xs--line-height': 'calc(1 / 0.71875)',
            '--dashboard-content-text-sm--line-height': 'calc(1.25 / 0.84375)',
            '--dashboard-content-text-base--line-height': 'calc(1.5 / 0.9375)',
            '--dashboard-content-text-lg--line-height': 'calc(1.75 / 1.0625)'
        })
    })
})
