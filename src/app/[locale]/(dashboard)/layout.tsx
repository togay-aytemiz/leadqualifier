import { createClient } from '@/lib/supabase/server'
import { MainSidebar } from '@/design'
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
        <div className="flex h-screen w-full bg-gray-50 overflow-hidden">
            <MainSidebar
                userName={userName}
                isSystemAdmin={orgContext?.isSystemAdmin ?? false}
                organizations={orgContext?.accessibleOrganizations ?? []}
                activeOrganizationId={orgContext?.activeOrganizationId ?? null}
                readOnlyTenantMode={orgContext?.readOnlyTenantMode ?? false}
            />
            <div className="flex-1 flex min-w-0 overflow-hidden">
                {children}
            </div>
        </div>
    )
}
