import dynamic from 'next/dynamic'
import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/design'
import { LeadsEmptyState } from '@/components/leads/LeadsEmptyState'
import { DashboardRouteSkeleton } from '@/components/common/DashboardRouteSkeleton'
import { getLeadsPageData } from '@/lib/leads/page-data'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

const LeadsClient = dynamic(
    () => import('@/components/leads/LeadsClient').then((mod) => mod.LeadsClient),
    {
        loading: () => <DashboardRouteSkeleton route="leads" />
    }
)

interface PageProps {
    searchParams: Promise<{ page?: string; sortBy?: string; sortOrder?: string; search?: string }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
    const supabase = await createClient()
    const locale = await getLocale()
    const t = await getTranslations('leads')

    const orgContext = await resolveActiveOrganizationContext()
    if (!orgContext) redirect(`/${locale}/login`)
    const organizationId = orgContext?.activeOrganizationId ?? null

    if (!organizationId) {
        return (
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader title={t('title')} />
                <div className="flex-1 flex items-center justify-center p-8">
                    <LeadsEmptyState
                        title={t('noOrganization')}
                        description={t('noOrganizationDesc')}
                    />
                </div>
            </div>
        )
    }

    await enforceWorkspaceAccessOrRedirect({
        organizationId,
        locale,
        currentPath: '/leads',
        supabase,
        bypassLock: orgContext?.isSystemAdmin ?? false
    })

    // Parse search params
    const params = await searchParams
    const page = parseInt(params.page || '1', 10)
    const sortBy = params.sortBy || 'updated_at'
    const sortOrder = (params.sortOrder || 'desc') as 'asc' | 'desc'
    const search = params.search

    const initialData = await getLeadsPageData({ page, pageSize: 20, sortBy, sortOrder, search }, organizationId)

    return (
        <LeadsClient
            initialData={initialData}
            initialQueryState={{
                page,
                sortBy,
                sortOrder,
                search: search ?? ''
            }}
            organizationId={organizationId}
        />
    )
}
