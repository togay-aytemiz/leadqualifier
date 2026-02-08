import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { createClient } from '@/lib/supabase/server'

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

    return (
        <SettingsResponsiveShell pendingCount={pendingCount}>
            {children}
        </SettingsResponsiveShell>
    )
}
