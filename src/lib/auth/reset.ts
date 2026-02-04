import { routing } from '@/i18n/routing'

export function normalizeLocale(locale: string) {
    if (routing.locales.includes(locale as typeof routing.locales[number])) {
        return locale
    }
    return routing.defaultLocale
}

export function buildPasswordResetRedirectUrl(baseUrl: string, locale: string) {
    const normalizedBaseUrl = baseUrl.replace(/\/$/, '')
    const resolvedLocale = normalizeLocale(locale)
    const prefix = resolvedLocale === routing.defaultLocale ? '' : `/${resolvedLocale}`
    return `${normalizedBaseUrl}${prefix}/reset-password`
}
