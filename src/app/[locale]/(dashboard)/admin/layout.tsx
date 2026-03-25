import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export async function generateMetadata(): Promise<Metadata> {
  const tSidebar = await getTranslations('mainSidebar')

  return {
    title: tSidebar('adminDashboard'),
  }
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardRouteIntlProvider namespaces={['admin', 'leads', 'aiQaLab']}>
      {children}
    </DashboardRouteIntlProvider>
  )
}
