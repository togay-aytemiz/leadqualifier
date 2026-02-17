import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { KnowledgeSidebar } from './components/KnowledgeSidebar'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

export default async function KnowledgeLayout({
    children,
    params
}: {
    children: React.ReactNode
    params: Promise<{ locale: string }>
}) {
    const { locale } = await params
    const orgContext = await resolveActiveOrganizationContext()
    const organizationId = orgContext?.activeOrganizationId ?? null

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/knowledge',
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

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
