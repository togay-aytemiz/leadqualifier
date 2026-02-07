import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { DataTable, TableHead, TableBody, TableRow, TableCell, PageHeader, EmptyState, Badge } from '@/design'
import { ArrowLeft, Users } from 'lucide-react'
import { requireSystemAdmin } from '@/lib/admin/access'
import { getAdminUserListResult } from '@/lib/admin/read-models'

interface AdminUsersPageProps {
    searchParams: Promise<{ search?: string; page?: string }>
}

export default async function AdminUsersPage({ searchParams }: AdminUsersPageProps) {
    const locale = await getLocale()
    const { supabase } = await requireSystemAdmin(locale)
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')
    const params = await searchParams
    const search = params.search?.trim() ?? ''
    const parsedPage = Number.parseInt(params.page ?? '1', 10)
    const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1

    const result = await getAdminUserListResult(
        {
            search,
            page,
            pageSize: 10
        },
        supabase
    )

    const users = result.items
    const formatDate = new Intl.DateTimeFormat(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    })
    const formatNumber = new Intl.NumberFormat(locale)
    const from = result.total === 0 ? 0 : (result.page - 1) * result.pageSize + 1
    const to = result.total === 0 ? 0 : from + users.length - 1
    const hasPrev = result.page > 1
    const hasNext = result.page < result.totalPages

    const buildPageHref = (nextPage: number) => {
        const nextSearchParams = new URLSearchParams()
        if (search) nextSearchParams.set('search', search)
        if (nextPage > 1) nextSearchParams.set('page', String(nextPage))
        const query = nextSearchParams.toString()
        return query ? `/admin/users?${query}` : '/admin/users'
    }

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title={tAdmin('users.title')}
                breadcrumb={
                    <Link href="/admin" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        {tCommon('back')}
                    </Link>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">{tAdmin('users.description')}</p>
                    <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-medium text-amber-900">
                        {tAdmin('readOnlyBanner')}
                    </p>

                    <form method="get" className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                        <div className="flex flex-col gap-3 md:flex-row md:items-center">
                            <input
                                type="text"
                                name="search"
                                defaultValue={search}
                                placeholder={tAdmin('users.searchPlaceholder')}
                                className="h-10 flex-1 rounded-lg border border-gray-200 px-3 text-sm text-gray-900 outline-none ring-blue-200 transition focus:ring-2"
                            />
                            <div className="flex items-center gap-2">
                                <button
                                    type="submit"
                                    className="h-10 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
                                >
                                    {tAdmin('users.searchAction')}
                                </button>
                                {search && (
                                    <Link
                                        href="/admin/users"
                                        className="h-10 rounded-lg border border-gray-200 px-4 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors inline-flex items-center"
                                    >
                                        {tAdmin('users.clearSearch')}
                                    </Link>
                                )}
                            </div>
                        </div>
                    </form>

                    <DataTable>
                        {users.length === 0 ? (
                            <EmptyState
                                icon={Users}
                                title={search ? tAdmin('users.emptySearchTitle') : tAdmin('users.emptyTitle')}
                                description={search ? tAdmin('users.emptySearchDesc') : tAdmin('users.emptyDesc')}
                            />
                        ) : (
                            <>
                                <TableHead columns={[
                                    tAdmin('users.columns.name'),
                                    tAdmin('users.columns.email'),
                                    tAdmin('users.columns.role'),
                                    tAdmin('users.columns.organizations'),
                                    tAdmin('users.columns.created'),
                                    tAdmin('users.columns.details')
                                ]} />
                                <TableBody>
                                    {users.map((user) => (
                                        <TableRow key={user.id}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">{user.fullName || '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{user.email ?? '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                {user.isSystemAdmin ? (
                                                    <Badge variant="purple">{tAdmin('users.roles.systemAdmin')}</Badge>
                                                ) : (
                                                    <Badge variant="neutral">{tAdmin('users.roles.user')}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                {user.organizations.length === 0 ? (
                                                    <span className="text-sm text-gray-400">{tAdmin('users.noOrganization')}</span>
                                                ) : (
                                                    <div className="space-y-1">
                                                        <p className="text-sm text-gray-700">
                                                            {tAdmin('users.organizationCount', { count: user.organizationCount })}
                                                        </p>
                                                        <p className="text-xs text-gray-500">
                                                            {user.organizations.map((membership) => membership.organizationName).join(', ')}
                                                        </p>
                                                    </div>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">
                                                    {formatDate.format(new Date(user.createdAt))}
                                                </span>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Link
                                                    href={`/admin/users/${user.id}`}
                                                    className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                                                >
                                                    {tAdmin('users.actions.viewDetails')}
                                                </Link>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </>
                        )}
                    </DataTable>

                    <div className="flex flex-col gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-sm md:flex-row md:items-center md:justify-between">
                        <p>
                            {tAdmin('users.showing', {
                                from: formatNumber.format(from),
                                to: formatNumber.format(to),
                                total: formatNumber.format(result.total)
                            })}
                        </p>
                        <div className="flex items-center gap-2">
                            <Link
                                href={buildPageHref(result.page - 1)}
                                aria-disabled={!hasPrev}
                                className={`rounded-lg border px-3 py-1.5 transition-colors ${hasPrev ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'pointer-events-none border-gray-100 text-gray-300'}`}
                            >
                                {tAdmin('users.pagination.prev')}
                            </Link>
                            <span className="text-xs text-gray-500">
                                {tAdmin('users.page', {
                                    current: formatNumber.format(result.page),
                                    total: formatNumber.format(result.totalPages)
                                })}
                            </span>
                            <Link
                                href={buildPageHref(result.page + 1)}
                                aria-disabled={!hasNext}
                                className={`rounded-lg border px-3 py-1.5 transition-colors ${hasNext ? 'border-gray-200 text-gray-700 hover:bg-gray-50' : 'pointer-events-none border-gray-100 text-gray-300'}`}
                            >
                                {tAdmin('users.pagination.next')}
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
