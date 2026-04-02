import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const {
    redirectMock,
    resolveActiveOrganizationContextMock
} = vi.hoisted(() => ({
    redirectMock: vi.fn(),
    resolveActiveOrganizationContextMock: vi.fn()
}))

vi.mock('next/navigation', () => ({
    redirect: redirectMock
}))

vi.mock('next-intl/server', () => ({
    getTranslations: vi.fn(async () => (key: string) => key)
}))

vi.mock('@/lib/organizations/active-context', () => ({
    resolveActiveOrganizationContext: resolveActiveOrganizationContextMock
}))

vi.mock('@/components/i18n/DashboardRouteIntlProvider', () => ({
    DashboardRouteIntlProvider: ({ children }: { children: React.ReactNode }) =>
        createElement('div', { 'data-provider': 'dashboard-route-intl' }, children)
}))

vi.mock('@/components/settings/SettingsResponsiveShell', () => ({
    SettingsResponsiveShell: ({
        children,
        activeOrganizationId
    }: {
        children: React.ReactNode
        activeOrganizationId: string | null
    }) => createElement('div', { 'data-org-id': activeOrganizationId ?? '' }, children)
}))

import SettingsLayout from './layout'

describe('settings layout redirect guard', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        redirectMock.mockImplementation(() => {
            throw new Error('NEXT_REDIRECT')
        })
    })

    it('redirects to login when the active organization context is missing', async () => {
        resolveActiveOrganizationContextMock.mockResolvedValue(null)

        await expect(SettingsLayout({
            children: createElement('span', null, 'child'),
            params: Promise.resolve({ locale: 'tr' })
        })).rejects.toThrow('NEXT_REDIRECT')

        expect(redirectMock).toHaveBeenCalledWith('/login')
    })

    it('renders the settings shell when the active organization context exists', async () => {
        resolveActiveOrganizationContextMock.mockResolvedValue({
            activeOrganizationId: 'org-1',
            isSystemAdmin: false
        })

        const element = await SettingsLayout({
            children: createElement('span', null, 'child'),
            params: Promise.resolve({ locale: 'tr' })
        })
        const html = renderToStaticMarkup(element)

        expect(html).toContain('child')
        expect(html).toContain('data-org-id="org-1"')
    })
})
