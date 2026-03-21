import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export default function SimulatorLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <DashboardRouteIntlProvider namespaces={['simulator']}>
            {children}
        </DashboardRouteIntlProvider>
    )
}
