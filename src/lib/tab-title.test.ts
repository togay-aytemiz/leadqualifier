import { describe, expect, it } from 'vitest'

import { buildTabDocumentTitle, resolveTabRouteId } from '@/lib/tab-title'

describe('resolveTabRouteId', () => {
    it('resolves localized dashboard routes', () => {
        expect(resolveTabRouteId('/en/inbox')).toBe('inbox')
        expect(resolveTabRouteId('/tr/skills')).toBe('skills')
        expect(resolveTabRouteId('/tr/knowledge/create')).toBe('knowledge')
    })

    it('resolves settings and admin branches', () => {
        expect(resolveTabRouteId('/en/settings/channels')).toBe('settings')
        expect(resolveTabRouteId('/en/admin/organizations/org_1')).toBe('adminOrganizations')
        expect(resolveTabRouteId('/tr/admin/users/user_1')).toBe('adminUsers')
    })

    it('resolves auth routes and returns null for unknown paths', () => {
        expect(resolveTabRouteId('/en/login')).toBe('login')
        expect(resolveTabRouteId('/tr/register')).toBe('register')
        expect(resolveTabRouteId('/en/unknown')).toBeNull()
    })
})

describe('buildTabDocumentTitle', () => {
    it('renders page title with brand suffix', () => {
        expect(buildTabDocumentTitle({ pageTitle: 'Inbox' })).toBe('Inbox | Qualy')
    })

    it('renders inbox dot indicator without unread count', () => {
        expect(buildTabDocumentTitle({ pageTitle: 'Inbox', showUnreadDot: true })).toBe('Inbox (●) | Qualy')
    })

    it('falls back to brand name when route title is missing', () => {
        expect(buildTabDocumentTitle({ pageTitle: null })).toBe('Qualy')
    })
})
