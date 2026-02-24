import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { QA_LAB_PRESETS } from '@/lib/qa-lab/presets'
import {
    getCurrentUserQaLabRole,
    listQaLabRuns
} from '@/lib/qa-lab/runs'
import { canAccessQaLab } from '@/lib/qa-lab/access'
import QaLabSettingsClient from './QaLabSettingsClient'

export default async function QaLabSettingsPage() {
    const locale = await getLocale()
    const tQaLab = await getTranslations('aiQaLab')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null

    const organizationId = orgContext.activeOrganizationId
    if (!organizationId) {
        return (
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <div className="flex-1 flex items-center justify-center text-gray-500">
                    <div className="text-center">
                        <h2 className="text-xl font-bold text-gray-900 mb-2">{tQaLab('noOrganization')}</h2>
                        <p>{tQaLab('noOrganizationDesc')}</p>
                    </div>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/qa-lab',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const userRole = await getCurrentUserQaLabRole(organizationId)
    const canAccess = canAccessQaLab({
        userEmail: orgContext.userEmail,
        userRole,
        isSystemAdmin: orgContext.isSystemAdmin
    })
    if (!canAccess) {
        redirect(`/${locale}/inbox`)
    }

    const runs = await listQaLabRuns(organizationId, { limit: 30 })
    const canStartRuns = userRole === 'admin'

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <QaLabSettingsClient
                initialRuns={runs}
                presets={QA_LAB_PRESETS}
                canStartRuns={canStartRuns}
                isReadOnlyTenantMode={orgContext.readOnlyTenantMode}
            />
        </div>
    )
}
