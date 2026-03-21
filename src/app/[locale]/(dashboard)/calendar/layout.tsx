import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export default function CalendarLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <DashboardRouteIntlProvider namespaces={['calendar']}>
            {children}
        </DashboardRouteIntlProvider>
    )
}
