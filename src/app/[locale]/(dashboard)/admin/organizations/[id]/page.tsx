import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Badge, DataTable, EmptyState, PageHeader, TableBody, TableCell, TableHead, TableRow } from '@/design'
import { ArrowLeft, Users } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminOrganizationDetail } from '@/lib/admin/read-models'

interface AdminOrganizationDetailsPageProps {
    params: Promise<{ id: string }>
}

export default async function AdminOrganizationDetailsPage({ params }: AdminOrganizationDetailsPageProps) {
    const { id } = await params
    const locale = await getLocale()
    const { supabase } = await requireSystemAdmin(locale)
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')

    const details = await getAdminOrganizationDetail(id, supabase)
    if (!details) {
        notFound()
    }

    const formatDate = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
    const formatNumber = new Intl.NumberFormat(locale)

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={tAdmin('organizationDetail.title')}
                breadcrumb={(
                    <Link href="/admin/organizations" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                )}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{tAdmin('organizationDetail.description')}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {tAdmin('readOnlyBanner')}
                    </p>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.name')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{details.organization.name}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.slug')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{details.organization.slug}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.created')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatDate.format(new Date(details.organization.createdAt))}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.profiles')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.profileCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.usage')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.totalMessageCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.tokens')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.totalTokenCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.skills')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.skillCount)}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.summary.knowledge')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatNumber.format(details.organization.knowledgeDocumentCount)}</p>
                        </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-3">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.premium')}</p>
                            <div className="mt-2">
                                <Badge variant="warning">{tAdmin('status.notIntegrated')}</Badge>
                            </div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.plan')}</p>
                            <div className="mt-2">
                                <Badge variant="neutral">{tAdmin('status.notIntegrated')}</Badge>
                            </div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('organizationDetail.billing.trial')}</p>
                            <div className="mt-2">
                                <Badge variant="info">{tAdmin('status.notIntegrated')}</Badge>
                            </div>
                        </div>
                    </div>

                    <DataTable>
                        {details.profiles.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title={tAdmin('organizationDetail.profiles.emptyTitle')}
                                description={tAdmin('organizationDetail.profiles.emptyDesc')}
                            />
                        ) : (
                            <>
                                <TableHead columns={[
                                    tAdmin('organizationDetail.profiles.columns.name'),
                                    tAdmin('organizationDetail.profiles.columns.email'),
                                    tAdmin('organizationDetail.profiles.columns.role'),
                                    tAdmin('organizationDetail.profiles.columns.systemAdmin'),
                                    tAdmin('organizationDetail.profiles.columns.organizations'),
                                    tAdmin('organizationDetail.profiles.columns.joined')
                                ]} />
                                <TableBody>
                                    {details.profiles.map((profile) => (
                                        <TableRow key={profile.userId}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">{profile.fullName ?? '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{profile.email ?? '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="info">{profile.role}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                {profile.isSystemAdmin ? (
                                                    <Badge variant="purple">{tAdmin('users.roles.systemAdmin')}</Badge>
                                                ) : (
                                                    <Badge variant="neutral">{tAdmin('users.roles.user')}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <p className="text-sm text-gray-700">
                                                        {tAdmin('users.organizationCount', { count: profile.organizationCount })}
                                                    </p>
                                                    <p className="text-xs text-gray-500">
                                                        {profile.organizations.map((membership) => membership.organizationName).join(', ')}
                                                    </p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">{formatDate.format(new Date(profile.joinedAt))}</span>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </>
                        )}
                    </DataTable>
                </div>
            </div>
        </div>
    )
}
