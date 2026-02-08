import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { KnowledgeSidebar } from './components/KnowledgeSidebar'
import { createClient } from '@/lib/supabase/server'

export default async function KnowledgeLayout({
    children,
}: {
    children: React.ReactNode
}) {
    const supabase = await createClient()
    const orgContext = await resolveActiveOrganizationContext(supabase)

    return (
        <div className="flex h-full w-full overflow-hidden bg-white">
            <div className="hidden lg:flex">
                <KnowledgeSidebar
                    organizationId={orgContext?.activeOrganizationId ?? null}
                    isReadOnly={orgContext?.readOnlyTenantMode ?? false}
                />
            </div>
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {children}
            </main>
        </div>
    )
}
