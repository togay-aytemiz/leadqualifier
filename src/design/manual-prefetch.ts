const DISABLED_FLAG_VALUES = new Set(['1', 'true', 'yes'])

const AUTH_MANUAL_PREFETCH_ROUTES = {
    login: ['/register', '/forgot-password'],
    register: ['/login', '/forgot-password', '/register/check-email'],
} as const

export type AuthManualPrefetchSurface = keyof typeof AUTH_MANUAL_PREFETCH_ROUTES
export type ManualPrefetchSurface = 'auth' | 'app-shell'

export function shouldEnableManualRoutePrefetch(
    surface: ManualPrefetchSurface = 'app-shell',
    environment: string = process.env.NODE_ENV ?? '',
    disabledFlag: string | undefined = process.env.NEXT_PUBLIC_DISABLE_MANUAL_PREFETCH
) {
    if (DISABLED_FLAG_VALUES.has((disabledFlag ?? '').trim().toLowerCase())) {
        return false
    }

    if (environment === 'test') {
        return false
    }

    if (surface === 'app-shell') {
        return false
    }

    return environment === 'production' || environment === 'development'
}

export function getAuthManualPrefetchRoutes(surface: AuthManualPrefetchSurface) {
    return [...AUTH_MANUAL_PREFETCH_ROUTES[surface]]
}
