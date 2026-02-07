import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import GeneralSettingsClient from './GeneralSettingsClient'

export default async function GeneralSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)

    const pendingCount = orgContext?.activeOrganizationId
        ? await getPendingOfferingProfileSuggestionCount(orgContext.activeOrganizationId, locale)
        : 0

    return <GeneralSettingsClient pendingCount={pendingCount} />
}
