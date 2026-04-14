import type { CSSProperties } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { MainSidebar } from '@/design'
import { MobileBottomNav } from '@/design/MobileBottomNav'
import { DashboardRouteTransitionViewport } from '@/components/common/DashboardRouteTransitionViewport'
import { canAccessQaLab } from '@/lib/qa-lab/access'
import { TabTitleSync } from '@/components/common/TabTitleSync'
import { resolveDashboardTypographyVariables } from '@/design/dashboard-typography'
import { OnboardingTrialBanner } from '@/components/onboarding/OnboardingTrialBanner'
import { OnboardingCompletionModal } from '@/components/onboarding/OnboardingCompletionModal'
import { getDashboardShellData } from '@/lib/dashboard/shell-data'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const shellData = await getDashboardShellData()
    const orgContext = shellData.orgContext
    const hasExplicitAdminOrganizationSelection = !(orgContext?.isSystemAdmin ?? false)
        || orgContext?.source === 'cookie'
    const sidebarOrganizationId = hasExplicitAdminOrganizationSelection
        ? (orgContext?.activeOrganizationId ?? null)
        : null
    const canAccessQaLabAdmin = canAccessQaLab({
        userEmail: orgContext?.userEmail,
        isSystemAdmin: orgContext?.isSystemAdmin ?? false
    })
    const onboardingOrganizationId = orgContext?.readOnlyTenantMode
        ? null
        : (orgContext?.activeOrganizationId ?? null)
    const billingSnapshot = shellData.billingSnapshot
    const aiSettings = shellData.aiSettings
    const requiresExplicitSelection = aiSettings?.bot_mode_unlock_required ?? false

    const userName = orgContext?.userFullName || orgContext?.userEmail || 'User'
    const userAvatarUrl = orgContext?.userAvatarUrl ?? null
    const dashboardContentTypographyStyle = resolveDashboardTypographyVariables('content') as CSSProperties

    return (
        <NextIntlClientProvider locale={shellData.locale} messages={shellData.messages}>
            <div className="flex h-screen w-full overflow-hidden bg-gray-50">
                <TabTitleSync organizationId={orgContext?.activeOrganizationId ?? null} />
                <div className="hidden lg:flex">
                    <MainSidebar
                        userName={userName}
                        userAvatarUrl={userAvatarUrl}
                        isSystemAdmin={orgContext?.isSystemAdmin ?? false}
                        organizations={orgContext?.accessibleOrganizations ?? []}
                        activeOrganizationId={sidebarOrganizationId}
                        readOnlyTenantMode={orgContext?.readOnlyTenantMode ?? false}
                        canAccessQaLabAdmin={canAccessQaLabAdmin}
                        onboardingState={shellData.onboardingState}
                        initialBotMode={aiSettings?.bot_mode ?? null}
                        initialBotModeUnlockRequired={aiSettings?.bot_mode_unlock_required ?? false}
                    />
                </div>
                <div
                    className="dashboard-content-type-scale relative flex min-w-0 flex-1 flex-col overflow-hidden"
                    style={dashboardContentTypographyStyle}
                >
                    {shellData.onboardingState?.showBanner && billingSnapshot ? (
                        <OnboardingTrialBanner
                            billingSnapshot={billingSnapshot}
                            showChecklistCta={shellData.onboardingState.showChecklistCta}
                        />
                    ) : null}
                    {onboardingOrganizationId && shellData.onboardingState?.isComplete ? (
                        <OnboardingCompletionModal
                            organizationId={onboardingOrganizationId}
                            isOpen={requiresExplicitSelection}
                            requiresExplicitSelection={requiresExplicitSelection}
                        />
                    ) : null}
                    <div className="flex min-h-0 flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        <DashboardRouteTransitionViewport>
                            {children}
                        </DashboardRouteTransitionViewport>
                    </div>
                    <MobileBottomNav
                        activeOrganizationId={orgContext?.activeOrganizationId ?? null}
                        onboardingState={shellData.onboardingState}
                    />
                </div>
            </div>
        </NextIntlClientProvider>
    )
}
