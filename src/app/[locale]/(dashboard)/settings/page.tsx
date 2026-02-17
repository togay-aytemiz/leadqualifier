import { getLocale, getTranslations } from 'next-intl/server'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function SettingsPage() {
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const orgContext = await resolveActiveOrganizationContext()

    await enforceWorkspaceAccessOrRedirect({
        organizationId: orgContext?.activeOrganizationId ?? null,
        locale,
        currentPath: '/settings',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    return (
        <div className="hidden lg:flex flex-1 items-center justify-center text-gray-500">
            <p className="text-sm">{tSidebar('settings')}</p>
        </div>
    )
}
