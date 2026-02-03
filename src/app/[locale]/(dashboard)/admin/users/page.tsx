import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { DataTable, TableHead, TableBody, TableRow, TableCell, PageHeader, EmptyState, Badge } from '@/design'
import { ArrowLeft, Users } from 'lucide-react'

export default async function AdminUsersPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tAdmin = await getTranslations('admin')
    const tCommon = await getTranslations('common')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect(`/${locale}/login`)
    }

    // Check if user is system admin
    const { data: profile } = await supabase
        .from('profiles')
        .select('is_system_admin')
        .eq('id', user.id)
        .single()

    if (!profile?.is_system_admin) {
        redirect(`/${locale}/dashboard`)
    }

    // Get all users/profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false })

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

                    <DataTable>
                        {(!profiles || profiles.length === 0) ? (
                            <EmptyState
                                icon={Users}
                                title={tAdmin('users.emptyTitle')}
                                description={tAdmin('users.emptyDesc')}
                            />
                        ) : (
                            <>
                                <TableHead columns={[
                                    tAdmin('users.columns.name'),
                                    tAdmin('users.columns.email'),
                                    tAdmin('users.columns.role'),
                                    tAdmin('users.columns.created'),
                                    tCommon('actions')
                                ]} />
                                <TableBody>
                                    {profiles.map((p) => (
                                        <TableRow key={p.id}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">{p.full_name || '-'}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">{p.email}</span>
                                            </TableCell>
                                            <TableCell>
                                                {p.is_system_admin ? (
                                                    <Badge variant="purple">{tAdmin('users.roles.systemAdmin')}</Badge>
                                                ) : (
                                                    <Badge variant="neutral">{tAdmin('users.roles.user')}</Badge>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">
                                                    {new Date(p.created_at).toLocaleDateString()}
                                                </span>
                                            </TableCell>
                                            <TableCell align="right">
                                                <div className="flex justify-end gap-3">
                                                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                                                        {tCommon('edit')}
                                                    </button>
                                                    {!p.is_system_admin && (
                                                        <button className="text-sm text-purple-600 hover:text-purple-700 font-medium">
                                                            {tAdmin('users.actions.makeAdmin')}
                                                        </button>
                                                    )}
                                                </div>
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
