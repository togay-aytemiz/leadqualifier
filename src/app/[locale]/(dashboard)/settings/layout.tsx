import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getOrganizationBillingSnapshot } from '@/lib/billing/server'
import { resolveWorkspaceAccessState } from '@/lib/billing/workspace-access'

export default async function SettingsLayout({
    children
}: {
    children: React.ReactNode
}) {
    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null

    const billingSnapshot = orgContext?.activeOrganizationId
        ? await getOrganizationBillingSnapshot(orgContext.activeOrganizationId)
        : null
    const billingOnlyMode = resolveWorkspaceAccessState(billingSnapshot).isLocked
        && !(orgContext?.isSystemAdmin ?? false)

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
                'Channels'
            ]}
        >
            <SettingsResponsiveShell
                activeOrganizationId={orgContext?.activeOrganizationId ?? null}
                billingOnlyMode={billingOnlyMode}
            >
                {children}
            </SettingsResponsiveShell>
        </DashboardRouteIntlProvider>
    )
}
