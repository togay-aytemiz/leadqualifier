import { SettingsResponsiveShell } from '@/components/settings/SettingsResponsiveShell'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'

export default async function SettingsLayout({
    children
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const locale = await getLocale()

    const {
        data: { user }
    } = await supabase.auth.getUser()

    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)
    const pendingCount = orgContext?.activeOrganizationId
        ? await getPendingOfferingProfileSuggestionCount(orgContext.activeOrganizationId, locale)
        : 0

    return (
        <SettingsResponsiveShell pendingCount={pendingCount}>
            {children}
        </SettingsResponsiveShell>
    )
}
