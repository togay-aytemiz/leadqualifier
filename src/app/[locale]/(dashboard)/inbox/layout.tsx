import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export default function InboxLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <DashboardRouteIntlProvider namespaces={['inbox']}>
            {children}
        </DashboardRouteIntlProvider>
    )
}
