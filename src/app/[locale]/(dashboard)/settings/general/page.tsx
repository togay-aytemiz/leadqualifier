import { getLocale } from 'next-intl/server'
import { redirect } from 'next/navigation'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function GeneralSettingsPage() {
    const locale = await getLocale()
    const orgContext = await resolveActiveOrganizationContext()

    await enforceWorkspaceAccessOrRedirect({
        organizationId: orgContext?.activeOrganizationId ?? null,
        locale,
        currentPath: '/settings/general',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const target = locale === 'tr' ? '/settings/organization' : `/${locale}/settings/organization`

    redirect(target)
}
