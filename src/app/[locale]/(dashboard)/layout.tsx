import { createClient } from '@/lib/supabase/server'
import { MainSidebar } from '@/design'
import { MobileBottomNav } from '@/design/MobileBottomNav'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { TabTitleSync } from '@/components/common/TabTitleSync'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const orgContext = await resolveActiveOrganizationContext()
    const supabase = await createClient()
    const { data: profile } = orgContext?.userId
        ? await supabase
            .from('profiles')
            .select('full_name, email')
            .eq('id', orgContext.userId)
            .maybeSingle()
        : { data: null }
    const hasExplicitAdminOrganizationSelection = !(orgContext?.isSystemAdmin ?? false)
        || orgContext?.source === 'cookie'
    const sidebarOrganizationId = hasExplicitAdminOrganizationSelection
        ? (orgContext?.activeOrganizationId ?? null)
        : null

    const userName = profile?.full_name || profile?.email || 'User'

    return (
        <div className="flex h-screen w-full overflow-hidden bg-gray-50">
            <TabTitleSync organizationId={orgContext?.activeOrganizationId ?? null} />
            <div className="hidden lg:flex">
                <MainSidebar
                    userName={userName}
                    isSystemAdmin={orgContext?.isSystemAdmin ?? false}
                    organizations={orgContext?.accessibleOrganizations ?? []}
                    activeOrganizationId={sidebarOrganizationId}
                    readOnlyTenantMode={orgContext?.readOnlyTenantMode ?? false}
                />
            </div>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                    {children}
                </div>
                <MobileBottomNav activeOrganizationId={orgContext?.activeOrganizationId ?? null} />
            </div>
        </div>
    )
}
