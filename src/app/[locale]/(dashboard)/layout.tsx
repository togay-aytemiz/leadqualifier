import { NextIntlClientProvider } from 'next-intl'
import { getLocale } from 'next-intl/server'
import { MainSidebar } from '@/design'
import { MobileBottomNav } from '@/design/MobileBottomNav'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { canAccessQaLab } from '@/lib/qa-lab/access'
import { TabTitleSync } from '@/components/common/TabTitleSync'
import { getScopedMessages } from '@/i18n/messages'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const locale = await getLocale()
    const orgContext = await resolveActiveOrganizationContext()
    const messages = await getScopedMessages(locale)
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

    return (
        <NextIntlClientProvider locale={locale} messages={messages}>
            <div className="flex h-screen w-full overflow-hidden bg-gray-50">
                <TabTitleSync organizationId={orgContext?.activeOrganizationId ?? null} />
                <div className="hidden lg:flex">
                    <MainSidebar
                        userName={userName}
                        isSystemAdmin={orgContext?.isSystemAdmin ?? false}
                        organizations={orgContext?.accessibleOrganizations ?? []}
                        activeOrganizationId={sidebarOrganizationId}
                        readOnlyTenantMode={orgContext?.readOnlyTenantMode ?? false}
                        canAccessQaLabAdmin={canAccessQaLabAdmin}
                    />
                </div>
                <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                    <div className="flex min-h-0 flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                        {children}
                    </div>
                    <MobileBottomNav activeOrganizationId={orgContext?.activeOrganizationId ?? null} />
                </div>
            </div>
        </NextIntlClientProvider>
    )
}
