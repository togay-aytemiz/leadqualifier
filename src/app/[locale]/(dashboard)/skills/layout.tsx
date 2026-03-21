import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export default function SkillsLayout({
    children
}: {
    children: React.ReactNode
}) {
    return (
        <DashboardRouteIntlProvider namespaces={['skills']}>
            {children}
        </DashboardRouteIntlProvider>
    )
}
