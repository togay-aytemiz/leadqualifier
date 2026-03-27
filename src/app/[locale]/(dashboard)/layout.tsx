import type { CSSProperties } from 'react'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { MainSidebar } from '@/design'
import { MobileBottomNav } from '@/design/MobileBottomNav'
import { DashboardRouteTransitionViewport } from '@/components/common/DashboardRouteTransitionViewport'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { canAccessQaLab } from '@/lib/qa-lab/access'
import { TabTitleSync } from '@/components/common/TabTitleSync'
import { DASHBOARD_SHELL_MESSAGE_NAMESPACES, getScopedMessages } from '@/i18n/messages'
import { resolveDashboardTypographyVariables } from '@/design/dashboard-typography'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const [locale, orgContext] = await Promise.all([
        getLocale(),
        resolveActiveOrganizationContext()
    ])
    const messagesPromise = getScopedMessages(locale, DASHBOARD_SHELL_MESSAGE_NAMESPACES)
    const messages = await messagesPromise
    const hasExplicitAdminOrganizationSelection = !(orgContext?.isSystemAdmin ?? false)
        || orgContext?.source === 'cookie'
    const sidebarOrganizationId = hasExplicitAdminOrganizationSelection
        ? (orgContext?.activeOrganizationId ?? null)
        : null
    const canAccessQaLabAdmin = canAccessQaLab({
        userEmail: orgContext?.userEmail,
        isSystemAdmin: orgContext?.isSystemAdmin ?? false
    })

    const userName = orgContext?.userFullName || orgContext?.userEmail || 'User'
    const userAvatarUrl = orgContext?.userAvatarUrl ?? null
    const dashboardContentTypographyStyle = resolveDashboardTypographyVariables('content') as CSSProperties

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
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
                    />
                </div>
                <div
                    className="dashboard-content-type-scale relative flex min-w-0 flex-1 flex-col overflow-hidden"
                    style={dashboardContentTypographyStyle}
                >
                    <div className="flex min-h-0 flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        <DashboardRouteTransitionViewport>
                            {children}
                        </DashboardRouteTransitionViewport>
                    </div>
                    <MobileBottomNav activeOrganizationId={orgContext?.activeOrganizationId ?? null} />
                </div>
            </div>
        </NextIntlClientProvider>
    )
}
