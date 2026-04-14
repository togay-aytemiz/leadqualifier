import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { buildLocalizedPath } from '@/lib/i18n/locale-path'
import { withDevTiming } from '@/lib/performance/timing'

const SETTINGS_ROUTE_MESSAGES_TIMING_LABEL = 'settings.layout.routeMessages'

export async function generateMetadata(): Promise<Metadata> {
  const tNav = await getTranslations('nav')

  return {
    title: tNav('settings'),
  }
}

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ locale: string }>
}) {
  const { locale } = await params
  const orgContext = await withDevTiming(
    'settings.layout.orgContext',
    () => resolveActiveOrganizationContext()
  )
  if (!orgContext) {
    redirect(buildLocalizedPath('/login', locale))
  }

  return (
    <DashboardRouteIntlProvider
      includeDashboardShell={false}
      timingLabel={SETTINGS_ROUTE_MESSAGES_TIMING_LABEL}
      namespaces={['Sidebar']}
    >
      <SettingsResponsiveShell
        activeOrganizationId={orgContext?.activeOrganizationId ?? null}
        bypassBillingOnlyMode={orgContext?.isSystemAdmin ?? false}
      >
        {children}
      </SettingsResponsiveShell>
    </DashboardRouteIntlProvider>
  )
}
