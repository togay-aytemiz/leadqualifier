import { routing } from '@/i18n/routing'

export type LocaleMessages = Record<string, unknown>

export function pickMessageNamespaces(
    messages: LocaleMessages,
    namespaces: readonly string[]
) {
    return namespaces.reduce<LocaleMessages>((result, namespace) => {
        if (namespace in messages) {
            result[namespace] = messages[namespace]
        }
        return result
    }, {})
}

export async function getScopedMessages(
    locale: string,
    namespaces?: readonly string[]
): Promise<LocaleMessages> {
    const resolvedLocale = routing.locales.includes(locale as 'en' | 'tr')
        ? locale
        : routing.defaultLocale
    const messages = (await import(`../../messages/${resolvedLocale}.json`)).default as LocaleMessages

    if (!namespaces || namespaces.length === 0) {
        return messages
    }

    return pickMessageNamespaces(messages, namespaces)
}
