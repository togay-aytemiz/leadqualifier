import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'
import { getPendingOfferingProfileSuggestionCount } from '@/lib/leads/settings'
import GeneralSettingsClient from './GeneralSettingsClient'

export default async function GeneralSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    const pendingCount = membership?.organization_id
        ? await getPendingOfferingProfileSuggestionCount(membership.organization_id, locale)
        : 0

    return <GeneralSettingsClient pendingCount={pendingCount} />
}
