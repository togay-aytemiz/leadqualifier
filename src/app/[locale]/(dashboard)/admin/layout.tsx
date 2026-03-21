import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export default function AdminLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <DashboardRouteIntlProvider namespaces={['admin', 'leads', 'aiQaLab']}>
            {children}
        </DashboardRouteIntlProvider>
    )
}
