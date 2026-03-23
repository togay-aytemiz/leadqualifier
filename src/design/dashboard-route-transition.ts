export const DASHBOARD_ROUTE_TRANSITION_START_EVENT = 'leadqualifier:dashboard-route-transition:start'

const DASHBOARD_ROUTE_SKELETONS = {
    '/inbox': 'inbox',
    '/leads': 'leads'
} as const

export type DashboardRouteSkeletonKey =
    (typeof DASHBOARD_ROUTE_SKELETONS)[keyof typeof DASHBOARD_ROUTE_SKELETONS]

interface DashboardRouteTransitionStartDetail {
    href: string
}

interface DashboardRoutePrefetcher {
    prefetch: (href: string) => void
}

interface DashboardRouteClickLikeEvent {
    altKey?: boolean
    button?: number
    ctrlKey?: boolean
    defaultPrevented?: boolean
    metaKey?: boolean
    shiftKey?: boolean
}

function readPathname(value: string) {
    const trimmed = value.trim()
    if (!trimmed) return '/'

    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
        try {
            return new URL(trimmed).pathname
        } catch {
            return trimmed
        }
    }

    const queryIndex = trimmed.search(/[?#]/)
    return queryIndex >= 0 ? trimmed.slice(0, queryIndex) : trimmed
}

export function normalizeDashboardRoutePath(value: string) {
    const pathname = readPathname(value)
    const withLeadingSlash = pathname.startsWith('/') ? pathname : `/${pathname}`
    const withoutLocale = withLeadingSlash.replace(/^\/[a-z]{2}(?=\/|$)/, '') || '/'

    if (withoutLocale.length > 1 && withoutLocale.endsWith('/')) {
        return withoutLocale.slice(0, -1)
    }

    return withoutLocale
}

export function shouldPrimeDashboardRoute(value: string) {
    const normalizedPath = normalizeDashboardRoutePath(value)
    return normalizedPath in DASHBOARD_ROUTE_SKELETONS
}

export function resolveDashboardRouteSkeleton(value: string | null | undefined) {
    if (!value) return null

    const normalizedPath = normalizeDashboardRoutePath(value)
    return DASHBOARD_ROUTE_SKELETONS[normalizedPath as keyof typeof DASHBOARD_ROUTE_SKELETONS] ?? null
}

export function primeDashboardRoute(
    router: DashboardRoutePrefetcher,
    href: string,
    localePrefix: string = ''
) {
    const normalizedPath = normalizeDashboardRoutePath(href)
    if (!shouldPrimeDashboardRoute(normalizedPath)) return

    router.prefetch(`${localePrefix}${normalizedPath}`)
}

export function dispatchDashboardRouteTransitionStart(href: string) {
    if (typeof window === 'undefined') return

    const normalizedPath = normalizeDashboardRoutePath(href)
    if (!shouldPrimeDashboardRoute(normalizedPath)) return

    const detail: DashboardRouteTransitionStartDetail = {
        href: normalizedPath
    }
    window.dispatchEvent(new CustomEvent(DASHBOARD_ROUTE_TRANSITION_START_EVENT, { detail }))
}

export function shouldStartDashboardRouteTransition(
    event: DashboardRouteClickLikeEvent
) {
    if (event.defaultPrevented) return false

    return (event.button ?? 0) === 0
        && !event.metaKey
        && !event.ctrlKey
        && !event.altKey
        && !event.shiftKey
}
