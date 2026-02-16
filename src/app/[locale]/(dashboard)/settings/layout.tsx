import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { createClient } from '@/lib/supabase/server'
import { getOrganizationBillingSnapshot } from '@/lib/billing/server'
import { resolveWorkspaceAccessState } from '@/lib/billing/workspace-access'

export default async function SettingsLayout({
    children
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()

    const orgContext = await resolveActiveOrganizationContext(supabase)
    if (!orgContext) return null

    const pendingCount = orgContext?.activeOrganizationId
        ? await getPendingOfferingProfileSuggestionCount(orgContext.activeOrganizationId)
        : 0
    const billingSnapshot = orgContext?.activeOrganizationId
        ? await getOrganizationBillingSnapshot(orgContext.activeOrganizationId, { supabase })
        : null
    const billingOnlyMode = resolveWorkspaceAccessState(billingSnapshot).isLocked
        && !(orgContext?.isSystemAdmin ?? false)

    return (
        <SettingsResponsiveShell pendingCount={pendingCount} billingOnlyMode={billingOnlyMode}>
            {children}
        </SettingsResponsiveShell>
    )
}
