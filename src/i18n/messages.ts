import { routing } from '@/i18n/routing'

export type LocaleMessages = Record<string, unknown>

export const DASHBOARD_SHELL_MESSAGE_NAMESPACES = [
    'auth',
    'common',
    'nav',
    'mainSidebar',
    'aiSettings'
] as const

export function mergeMessageNamespaceLists(
    baseNamespaces: readonly string[],
    extraNamespaces: readonly string[] = []
) {
    return Array.from(new Set([...baseNamespaces, ...extraNamespaces]))
}

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

import { cache } from 'react'

const loadMessages = cache(async (locale: string) => {
    return (await import(`../../messages/${locale}.json`)).default as LocaleMessages
})

export async function getScopedMessages(
    locale: string,
    namespaces?: readonly string[]
): Promise<LocaleMessages> {
    const resolvedLocale = routing.locales.includes(locale as 'en' | 'tr')
        ? locale
        : routing.defaultLocale
    
    const messages = await loadMessages(resolvedLocale)

    if (!namespaces || namespaces.length === 0) {
        return messages
    }

    return pickMessageNamespaces(messages, namespaces)
}
