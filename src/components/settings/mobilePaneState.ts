export const SETTINGS_MOBILE_BACK_EVENT = 'settings-mobile-back'
const SETTINGS_BASE_PATH = '/settings'

export type SettingsNavItemId =
    | 'profile'
    | 'organization'
    | 'ai'
    | 'channels'
    | 'plans'
    | 'billing'

const SETTINGS_NAV_ITEMS = new Set<SettingsNavItemId>([
    'profile',
    'organization',
    'ai',
    'channels',
    'plans',
    'billing'
])

function stripLocalePrefix(pathname: string): string {
    if (!pathname.startsWith('/')) return pathname

    const segments = pathname.split('/').filter(Boolean)
    if (segments.length === 0) return '/'

    if (segments[0] === 'en' || segments[0] === 'tr') {
        const next = segments.slice(1)
        return next.length === 0 ? '/' : `/${next.join('/')}`
    }

    return pathname
}

export function isSettingsDetailPath(pathname: string): boolean {
    const normalizedPath = stripLocalePrefix(pathname)
    return normalizedPath.startsWith(`${SETTINGS_BASE_PATH}/`)
}

export function getSettingsNavItemFromPath(pathname: string): SettingsNavItemId | null {
    const normalizedPath = stripLocalePrefix(pathname)

    if (!normalizedPath.startsWith(`${SETTINGS_BASE_PATH}/`)) {
        return null
    }

    const detailSegments = normalizedPath.slice(`${SETTINGS_BASE_PATH}/`.length).split('/')
    const firstSegment = detailSegments[0]

    if (!firstSegment || !SETTINGS_NAV_ITEMS.has(firstSegment as SettingsNavItemId)) {
        return null
    }

    return firstSegment as SettingsNavItemId
}

export function getSettingsMobileListPaneClasses(isDetailOpen: boolean): string {
    return isDetailOpen
        ? '-translate-x-full pointer-events-none'
        : 'translate-x-0 pointer-events-auto'
}

export function getSettingsMobileDetailPaneClasses(isDetailOpen: boolean): string {
    return isDetailOpen
        ? 'translate-x-0 pointer-events-auto'
        : 'translate-x-full pointer-events-none'
}
