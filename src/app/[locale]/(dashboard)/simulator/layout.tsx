import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'

export async function generateMetadata(): Promise<Metadata> {
  const tNav = await getTranslations('nav')

  return {
    title: tNav('simulator'),
  }
}

export default function SimulatorLayout({ children }: { children: React.ReactNode }) {
  return (
    <DashboardRouteIntlProvider namespaces={['simulator']}>{children}</DashboardRouteIntlProvider>
  )
}
