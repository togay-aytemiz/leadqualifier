import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import {
    DASHBOARD_SHELL_MESSAGE_NAMESPACES,
    getScopedMessages,
    mergeMessageNamespaceLists
} from '@/i18n/messages'

interface DashboardRouteIntlProviderProps {
    children: React.ReactNode
    namespaces: readonly string[]
}

export async function DashboardRouteIntlProvider({
    children,
    namespaces
}: DashboardRouteIntlProviderProps) {
    const locale = await getLocale()
    const messages = await getScopedMessages(
        locale,
        mergeMessageNamespaceLists(DASHBOARD_SHELL_MESSAGE_NAMESPACES, namespaces)
    )

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
        </NextIntlClientProvider>
    )
}
