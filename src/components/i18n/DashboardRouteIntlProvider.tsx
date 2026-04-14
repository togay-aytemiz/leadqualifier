import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import {
    DASHBOARD_SHELL_MESSAGE_NAMESPACES,
    getScopedMessages,
    mergeMessageNamespaceLists
} from '@/i18n/messages'
import { withDevTiming } from '@/lib/performance/timing'

interface DashboardRouteIntlProviderProps {
    children: React.ReactNode
    namespaces: readonly string[]
    includeDashboardShell?: boolean
    timingLabel?: string
}

export async function DashboardRouteIntlProvider({
    children,
    includeDashboardShell = true,
    namespaces,
    timingLabel = 'dashboard.routeIntl.messages'
}: DashboardRouteIntlProviderProps) {
    const locale = await getLocale()
    const scopedNamespaces = includeDashboardShell
        ? mergeMessageNamespaceLists(DASHBOARD_SHELL_MESSAGE_NAMESPACES, namespaces)
        : namespaces
    const messages = await withDevTiming(
        timingLabel,
        () => getScopedMessages(locale, scopedNamespaces)
    )

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            {children}
        </NextIntlClientProvider>
    )
}
