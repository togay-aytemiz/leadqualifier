import { getLocale, getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'

import QaLabSettingsClient from '@/app/[locale]/(dashboard)/settings/qa-lab/QaLabSettingsClient'
import { QA_LAB_PRESETS } from '@/lib/qa-lab/presets'
import { canAccessQaLab } from '@/lib/qa-lab/access'
import { listQaLabRuns } from '@/lib/qa-lab/runs'
import { requireSystemAdmin } from '@/lib/admin/access'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export default async function AdminQaLabPage() {
    const locale = await getLocale()
    const tQaLab = await getTranslations('aiQaLab')
    await requireSystemAdmin(locale)

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null

    if (!canAccessQaLab({
        userEmail: orgContext.userEmail,
        isSystemAdmin: orgContext.isSystemAdmin
    })) {
        redirect(`/${locale}/admin`)
    }

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

    const runs = await listQaLabRuns(organizationId, { limit: 30 })

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <QaLabSettingsClient
                initialRuns={runs}
                presets={QA_LAB_PRESETS}
                canStartRuns={true}
                isReadOnlyTenantMode={false}
                runDetailBasePath="/admin/qa-lab"
                headerTitle={tQaLab('pageTitle')}
                headerBackHref="/admin"
                adminMode
            />
        </div>
    )
}
