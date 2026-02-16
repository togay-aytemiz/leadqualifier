import { getTranslations, getLocale } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/design'
import { getLeads, getRequiredFields } from '@/lib/leads/list-actions'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadSearch } from '@/components/leads/LeadSearch'
import { LeadsEmptyState } from '@/components/leads/LeadsEmptyState'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { enforceWorkspaceAccessOrRedirect } from '@/lib/billing/workspace-access'

interface PageProps {
    searchParams: Promise<{ page?: string; sortBy?: string; sortOrder?: string; search?: string }>
}

export default async function LeadsPage({ searchParams }: PageProps) {
    const supabase = await createClient()
    const locale = await getLocale()
    const t = await getTranslations('leads')

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect(`/${locale}/login`)

    const orgContext = await resolveActiveOrganizationContext(supabase)
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

    // Fetch data
    const [leadsResult, requiredFields] = await Promise.all([
        getLeads({ page, pageSize: 20, sortBy, sortOrder, search }, organizationId),
        getRequiredFields(organizationId)
    ])

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={t('title')}
                actions={<LeadSearch />}
            />
            <div className="flex-1 overflow-auto p-3 md:p-6">
                {leadsResult.total === 0 ? (
                    <div className="flex items-center justify-center h-full">
                        <LeadsEmptyState
                            title={t('noLeads')}
                            description={t('noLeadsDesc')}
                        />
                    </div>
                ) : (
                    <LeadsTable
                        leads={leadsResult.leads}
                        total={leadsResult.total}
                        page={leadsResult.page}
                        pageSize={leadsResult.pageSize}
                        totalPages={leadsResult.totalPages}
                        sortBy={sortBy}
                        sortOrder={sortOrder}
                        requiredFields={requiredFields}
                    />
                )}
            </div>
        </div>
    )
}
