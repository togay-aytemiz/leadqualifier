export const DASHBOARD_ROUTE_TRANSITION_START_EVENT = 'leadqualifier:dashboard-route-transition:start'

const DASHBOARD_ROUTE_FAMILIES = [
    { prefix: '/inbox', skeleton: 'inbox' },
    { prefix: '/calendar', skeleton: 'page' },
    { prefix: '/leads', skeleton: 'leads' },
    { prefix: '/simulator', skeleton: 'page' },
    { prefix: '/skills', skeleton: 'page' },
    { prefix: '/knowledge', skeleton: 'knowledge' },
    { prefix: '/settings', skeleton: 'page' },
    { prefix: '/admin', skeleton: 'admin' }
] as const

export type DashboardRouteSkeletonKey =
    (typeof DASHBOARD_ROUTE_FAMILIES)[number]['skeleton']

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

function resolveDashboardRouteFamily(value: string) {
    const normalizedPath = normalizeDashboardRoutePath(value)

    return DASHBOARD_ROUTE_FAMILIES.find(({ prefix }) => (
        normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`)
    )) ?? null
}

export function shouldPrimeDashboardRoute(value: string) {
    return Boolean(resolveDashboardRouteFamily(value))
}

export function resolveDashboardRouteSkeleton(value: string | null | undefined) {
    if (!value) return null

    return resolveDashboardRouteFamily(value)?.skeleton ?? null
}

export function resolveOptimisticDashboardPath(
    currentPath: string,
    pendingPath: string | null | undefined
) {
    const normalizedCurrentPath = normalizeDashboardRoutePath(currentPath)
    const normalizedPendingPath = pendingPath
        ? normalizeDashboardRoutePath(pendingPath)
        : null

    if (!normalizedPendingPath || normalizedPendingPath === normalizedCurrentPath) {
        return normalizedCurrentPath
    }

    if (!resolveDashboardRouteSkeleton(normalizedPendingPath)) {
        return normalizedCurrentPath
    }

    return normalizedPendingPath
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
