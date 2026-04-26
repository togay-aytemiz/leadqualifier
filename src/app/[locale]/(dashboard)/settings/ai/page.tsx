import { getTranslations } from 'next-intl/server'
import AiSettingsClient from './AiSettingsClient'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'
import { DashboardRouteIntlProvider } from '@/components/i18n/DashboardRouteIntlProvider'
import { getDashboardShellData } from '@/lib/dashboard/shell-data'
import { getOrgAiSettings } from '@/lib/ai/settings'
import { getOrganizationOnboardingState } from '@/lib/onboarding/state'

export default async function AiSettingsPage() {
    const shellData = await getDashboardShellData()
    const locale = shellData.locale
    const tAi = await getTranslations('aiSettings')

    const orgContext = shellData.orgContext
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

    const onboardingState = shellData.onboardingState
        ?? await getOrganizationOnboardingState(organizationId)
    const aiSettings = shellData.aiSettings
        ?? await getOrgAiSettings(organizationId, { locale, onboardingState })

    return (
        <DashboardRouteIntlProvider includeDashboardShell={false} namespaces={['aiSettings', 'Sidebar', 'unsavedChanges']}>
            <AiSettingsClient
                initialSettings={aiSettings}
                onboardingState={onboardingState}
            />
        </DashboardRouteIntlProvider>
    )
}
