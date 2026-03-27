import type { Metadata } from 'next'
import { getTranslations } from 'next-intl/server'
import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export async function generateMetadata(): Promise<Metadata> {
  const tNav = await getTranslations('nav')

  return {
    title: tNav('settings'),
  }
}

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const orgContext = await resolveActiveOrganizationContext()
  if (!orgContext) return null

  return (
    <DashboardRouteIntlProvider
      namespaces={[
        'Sidebar',
        'organizationSettings',
        'unsavedChanges',
        'profileSettings',
        'calendar',
        'billingUsage',
        'billingPlans',
        'aiQaLab',
        'Channels',
      ]}
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
