import { createClient } from '@/lib/supabase/server'
import { getLocale, getTranslations } from 'next-intl/server'
import AiSettingsClient from './AiSettingsClient'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function AiSettingsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tAi = await getTranslations('aiSettings')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) return null
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tAi('noOrganization')}</h2>
                    <p>{tAi('noOrganizationDesc')}</p>
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/settings/ai',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    const aiSettings = await getOrgAiSettings(organizationId, { supabase, locale })

    return <AiSettingsClient initialSettings={aiSettings} />
}
