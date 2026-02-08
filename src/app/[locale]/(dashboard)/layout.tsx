import { createClient } from '@/lib/supabase/server'
import { MainSidebar } from '@/design'
import { MobileBottomNav } from '@/design/MobileBottomNav'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'

export default async function DashboardLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const {
        data: { user },
    } = await supabase.auth.getUser()

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user?.id)
        .single()
    const orgContext = await resolveActiveOrganizationContext(supabase)

    const userName = profile?.full_name || profile?.email || 'User'

    return (
        <div className="flex h-screen w-full overflow-hidden bg-gray-50">
            <div className="hidden lg:flex">
                <MainSidebar
                    userName={userName}
                    isSystemAdmin={orgContext?.isSystemAdmin ?? false}
                    organizations={orgContext?.accessibleOrganizations ?? []}
                    activeOrganizationId={orgContext?.activeOrganizationId ?? null}
                    readOnlyTenantMode={orgContext?.readOnlyTenantMode ?? false}
                />
            </div>
            <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
                <div className="flex min-h-0 flex-1 overflow-hidden pb-[calc(4.5rem+env(safe-area-inset-bottom))] lg:pb-0">
                    {children}
                </div>
                <MobileBottomNav />
            </div>
        </div>
    )
}
