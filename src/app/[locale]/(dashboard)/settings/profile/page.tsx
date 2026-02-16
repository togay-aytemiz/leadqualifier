import { createClient } from '@/lib/supabase/server'
import { getLocale } from 'next-intl/server'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import ProfileSettingsClient from './ProfileSettingsClient'

export default async function ProfileSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const orgContext = await resolveActiveOrganizationContext(supabase)
    await enforceWorkspaceAccessOrRedirect({
        organizationId: orgContext?.activeOrganizationId ?? null,
        locale,
        currentPath: '/settings/profile',
        supabase,
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

    const initialName = profile?.full_name ?? ''
    const email = profile?.email ?? user.email ?? ''
    return <ProfileSettingsClient initialName={initialName} email={email} />
}
