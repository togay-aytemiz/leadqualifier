import { notFound } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { Badge, DataTable, EmptyState, PageHeader, TableBody, TableCell, TableHead, TableRow } from '@/design'
import { ArrowLeft, Building2 } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminUserDetail } from '@/lib/admin/read-models'

interface AdminUserDetailsPageProps {
    params: Promise<{ id: string }>
}

export default async function AdminUserDetailsPage({ params }: AdminUserDetailsPageProps) {
    const { id } = await params
    const locale = await getLocale()
    const { supabase } = await requireSystemAdmin(locale)
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')

    const details = await getAdminUserDetail(id, supabase)
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
                title={tAdmin('userDetail.title')}
                breadcrumb={(
                    <Link href="/admin/users" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                )}
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{tAdmin('userDetail.description')}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {tAdmin('readOnlyBanner')}
                    </p>

                    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('userDetail.profile.name')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{details.user.fullName ?? '-'}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('userDetail.profile.email')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{details.user.email ?? '-'}</p>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('userDetail.profile.role')}</p>
                            <div className="mt-2">
                                {details.user.isSystemAdmin ? (
                                    <Badge variant="purple">{tAdmin('users.roles.systemAdmin')}</Badge>
                                ) : (
                                    <Badge variant="neutral">{tAdmin('users.roles.user')}</Badge>
                                )}
                            </div>
                        </div>
                        <div className="rounded-xl border border-gray-200 bg-white p-4">
                            <p className="text-xs uppercase tracking-wider text-gray-400">{tAdmin('userDetail.profile.created')}</p>
                            <p className="mt-2 text-sm font-semibold text-gray-900">{formatDate.format(new Date(details.user.createdAt))}</p>
                        </div>
                    </div>

                    <DataTable>
                        {details.organizationSnapshots.length === 0 ? (
                            <EmptyState
                                icon={Building2}
                                title={tAdmin('userDetail.emptyTitle')}
                                description={tAdmin('userDetail.emptyDesc')}
                            />
                        ) : (
                            <>
                                <TableHead columns={[
                                    tAdmin('userDetail.columns.organization'),
                                    tAdmin('userDetail.columns.role'),
                                    tAdmin('userDetail.columns.usage'),
                                    tAdmin('userDetail.columns.tokens'),
                                    tAdmin('userDetail.columns.skills'),
                                    tAdmin('userDetail.columns.knowledge'),
                                    tAdmin('userDetail.columns.premium'),
                                    tAdmin('userDetail.columns.plan'),
                                    tAdmin('userDetail.columns.trial')
                                ]} />
                                <TableBody>
                                    {details.organizationSnapshots.map((organization) => (
                                        <TableRow key={organization.id}>
                                            <TableCell>
                                                <div className="space-y-1">
                                                    <p className="font-medium text-gray-900">{organization.name}</p>
                                                    <p className="text-xs text-gray-500">{organization.slug}</p>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="info">{organization.role}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(organization.totalMessageCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(organization.totalTokenCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(organization.skillCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{formatNumber.format(organization.knowledgeDocumentCount)}</span>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="warning">{tAdmin('status.notIntegrated')}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="neutral">{tAdmin('status.notIntegrated')}</Badge>
                                            </TableCell>
                                            <TableCell>
                                                <Badge variant="info">{tAdmin('status.notIntegrated')}</Badge>
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
