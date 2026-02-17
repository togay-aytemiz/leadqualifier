import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
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

    const [pendingCount, billingSnapshot] = orgContext?.activeOrganizationId
        ? await Promise.all([
            getPendingOfferingProfileSuggestionCount(orgContext.activeOrganizationId),
            getOrganizationBillingSnapshot(orgContext.activeOrganizationId)
        ])
        : [0, null]
    const billingOnlyMode = resolveWorkspaceAccessState(billingSnapshot).isLocked
        && !(orgContext?.isSystemAdmin ?? false)

    return (
        <SettingsResponsiveShell pendingCount={pendingCount} billingOnlyMode={billingOnlyMode}>
            {children}
        </SettingsResponsiveShell>
    )
}
