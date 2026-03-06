import { routing } from '@/i18n/routing'

type SupportedLocale = typeof routing.locales[number]

export function normalizeAppLocale(locale: string | null | undefined): SupportedLocale {
    return routing.locales.includes(locale as SupportedLocale)
        ? locale as SupportedLocale
        : routing.defaultLocale
}

export function buildLocalizedPath(pathname: string, locale: string | null | undefined) {
    const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`
    const resolvedLocale = normalizeAppLocale(locale)
    const prefix = resolvedLocale === routing.defaultLocale ? '' : `/${resolvedLocale}`
    return `${prefix}${normalizedPathname}`
}
