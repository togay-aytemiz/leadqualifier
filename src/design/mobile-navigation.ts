export type MobileNavItemId = 'inbox' | 'contacts' | 'ai' | 'other'

function normalizePathname(pathname: string): string {
    if (!pathname) return '/'
    const normalized = pathname.startsWith('/') ? pathname : `/${pathname}`
    const withoutLocale = normalized.replace(/^\/(en|tr)(?=\/|$)/, '')
    return withoutLocale === '' ? '/' : withoutLocale
}

export function resolveMobileNavActiveItem(pathname: string): MobileNavItemId {
    const path = normalizePathname(pathname)

    if (path.startsWith('/inbox')) return 'inbox'
    if (path.startsWith('/leads')) return 'contacts'
    if (path.startsWith('/skills') || path.startsWith('/knowledge')) return 'ai'
    if (path.startsWith('/simulator') || path.startsWith('/settings')) return 'other'

    return 'inbox'
}
