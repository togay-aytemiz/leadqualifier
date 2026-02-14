import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/design'
import { requireSystemAdmin } from '@/lib/admin/access'
import { resolveActiveOrganizationContext } from '@/lib/organizations/active-context'
import { getLeads, getRequiredFields } from '@/lib/leads/list-actions'
import { LeadsTable } from '@/components/leads/LeadsTable'
import { LeadSearch } from '@/components/leads/LeadSearch'
import { LeadsEmptyState } from '@/components/leads/LeadsEmptyState'

interface AdminLeadsPageProps {
    searchParams: Promise<{ page?: string; sortBy?: string; sortOrder?: string; search?: string }>
}

export default async function AdminLeadsPage({ searchParams }: AdminLeadsPageProps) {
    const locale = await getLocale()
    const { supabase } = await requireSystemAdmin(locale)
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')

    const orgContext = await resolveActiveOrganizationContext(supabase)
    const activeOrganization = orgContext?.activeOrganization ?? null

    const params = await searchParams
    const page = Number.parseInt(params.page ?? '1', 10)
    const sortBy = params.sortBy || 'updated_at'
    const sortOrder = (params.sortOrder || 'desc') as 'asc' | 'desc'
    const search = params.search

    if (!activeOrganization) {
        return (
            <div data-testid="admin-leads-page" className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader
                    title={tAdmin('leads.title')}
                    breadcrumb={(
                        <Link href="/admin" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                            <ArrowLeft size={18} />
                            {tCommon('back')}
                        </Link>
                    )}
                    actions={<LeadSearch />}
                />
                <div className="flex-1 overflow-auto p-8">
                    <div className="w-full space-y-6">
                        <p className="text-gray-500">{tAdmin('leads.description')}</p>
                        <p data-testid="admin-readonly-banner" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                            {tAdmin('readOnlyBanner')}
                        </p>
                        <LeadsEmptyState
                            title={tAdmin('leads.noOrganizationTitle')}
                            description={tAdmin('leads.noOrganizationDesc')}
                        />
                    </div>
                </div>
            </div>
        )
    }

    const selectedOrganization = activeOrganization
    const organizationId = selectedOrganization.id

    const [leadsResult, requiredFields] = await Promise.all([
        getLeads({
            page: Number.isFinite(page) && page > 0 ? page : 1,
            pageSize: 20,
            sortBy,
            sortOrder,
            search
        }, organizationId),
        getRequiredFields(organizationId)
    ])

    return (
        <div data-testid="admin-leads-page" className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={tAdmin('leads.title')}
                breadcrumb={(
                    <Link href="/admin" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                )}
                actions={<LeadSearch />}
            />

            <div className="flex-1 overflow-auto p-3 md:p-6">
                <div className="w-full space-y-4 md:space-y-6">
                    <p className="text-gray-500">{tAdmin('leads.description')}</p>
                    <p data-testid="admin-readonly-banner" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {tAdmin('readOnlyBanner')}
                    </p>

                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-gray-500">
                            {tAdmin('leads.activeOrganization')}
                        </p>
                        <p className="mt-2 text-sm font-semibold text-gray-900">{selectedOrganization.name}</p>
                        <p className="mt-1 text-xs text-gray-500">{selectedOrganization.slug}</p>
                        <p className="mt-2 text-xs text-gray-500">{tAdmin('leads.activeOrganizationHint')}</p>
                    </div>

                    {leadsResult.total === 0 ? (
                        <div className="rounded-xl border border-gray-200 bg-white p-8">
                            <LeadsEmptyState
                                title={tAdmin('leads.emptyTitle')}
                                description={tAdmin('leads.emptyDesc')}
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
        </div>
    )
}
