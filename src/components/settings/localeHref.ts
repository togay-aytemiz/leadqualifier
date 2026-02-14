type SupportedLocale = 'en' | 'tr'

interface TransformPendingHrefForLocaleOptions {
    href: string
    currentLocale: SupportedLocale
    nextLocale: SupportedLocale
}

function hasLocalePrefix(locale: SupportedLocale, path: string): boolean {
    return path === `/${locale}` || path.startsWith(`/${locale}/`)
}

export function transformPendingHrefForLocale({
    href,
    currentLocale,
    nextLocale
}: TransformPendingHrefForLocaleOptions): string {
    if (currentLocale === nextLocale) return href

    let nextHref = href || '/'

    if (!nextHref.startsWith('/')) {
        nextHref = `/${nextHref}`
    }

    if (currentLocale !== 'tr' && hasLocalePrefix(currentLocale, nextHref)) {
        nextHref = nextHref.replace(new RegExp(`^/${currentLocale}(?=/|$|\\?|#)`), '')
        if (!nextHref.startsWith('/')) {
            nextHref = `/${nextHref}`
        }
    }

    if (nextLocale !== 'tr' && !hasLocalePrefix(nextLocale, nextHref)) {
        nextHref = `/${nextLocale}${nextHref}`
    }

    return nextHref || '/'
}
