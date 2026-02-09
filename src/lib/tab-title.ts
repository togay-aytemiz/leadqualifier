export type TabRouteId =
    | 'home'
    | 'inbox'
    | 'leads'
    | 'skills'
    | 'knowledge'
    | 'simulator'
    | 'settings'
    | 'adminDashboard'
    | 'adminOrganizations'
    | 'adminLeads'
    | 'adminUsers'
    | 'login'
    | 'register'
    | 'forgotPassword'
    | 'resetPassword'

function normalizePathname(pathname: string): string {
    if (!pathname) return '/'
    const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
    const withoutLocale = normalized.replace(/^\/[a-z]{2}(?=\/|$)/, '')
    return withoutLocale === '' ? '/' : withoutLocale
}

export function resolveTabRouteId(pathname: string): TabRouteId | null {
    const path = normalizePathname(pathname)

    if (path === '/') return 'home'
    if (path.startsWith('/inbox')) return 'inbox'
    if (path.startsWith('/leads')) return 'leads'
    if (path.startsWith('/skills')) return 'skills'
    if (path.startsWith('/knowledge')) return 'knowledge'
    if (path.startsWith('/simulator')) return 'simulator'
    if (path.startsWith('/settings')) return 'settings'

    if (path === '/admin') return 'adminDashboard'
    if (path.startsWith('/admin/organizations')) return 'adminOrganizations'
    if (path.startsWith('/admin/leads')) return 'adminLeads'
    if (path.startsWith('/admin/users')) return 'adminUsers'

    if (path.startsWith('/login')) return 'login'
    if (path.startsWith('/register')) return 'register'
    if (path.startsWith('/forgot-password')) return 'forgotPassword'
    if (path.startsWith('/reset-password')) return 'resetPassword'

    return null
}

interface BuildTabDocumentTitleOptions {
    pageTitle: string | null
    brandTitle?: string
    showUnreadDot?: boolean
}

export function buildTabDocumentTitle({
    pageTitle,
    brandTitle = 'Qualy',
    showUnreadDot = false,
}: BuildTabDocumentTitleOptions): string {
    const normalizedPageTitle = pageTitle?.trim() ?? ''
    if (!normalizedPageTitle) return brandTitle

    const unreadSuffix = showUnreadDot ? ' (●)' : ''
    return `${normalizedPageTitle}${unreadSuffix} | ${brandTitle}`
}
