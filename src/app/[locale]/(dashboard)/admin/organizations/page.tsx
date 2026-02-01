import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'
import { DataTable, TableHead, TableBody, TableRow, TableCell, PageHeader, EmptyState } from '@/design'
import { ArrowLeft, Building2 } from 'lucide-react'

export default async function AdminOrganizationsPage() {
    const supabase = await createClient()
    const locale = await getLocale()

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

    // Get all organizations with member counts
    const { data: organizations } = await supabase
        .from('organizations')
        .select(`
      *,
      organization_members(count)
    `)
        .order('created_at', { ascending: false })

    return (
        <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
            <PageHeader
                title="Organizations"
                breadcrumb={
                    <Link href="/admin" className="text-gray-400 hover:text-gray-600 flex items-center gap-1 text-sm mr-2 transition-colors">
                        <ArrowLeft size={18} />
                        Back
                    </Link>
                }
            />

            <div className="flex-1 overflow-auto p-8">
                <div className="max-w-6xl mx-auto space-y-8">
                    <p className="text-gray-500">Manage all organizations in the system</p>

                    <DataTable>
                        {(!organizations || organizations.length === 0) ? (
                            <EmptyState
                                icon={Building2}
                                title="No organizations found"
                                description="There are no organizations in the system yet."
                            />
                        ) : (
                            <>
                                <TableHead columns={['Name', 'Slug', 'Members', 'Created', 'Actions']} />
                                <TableBody>
                                    {organizations.map((org) => (
                                        <TableRow key={org.id}>
                                            <TableCell>
                                                <span className="font-medium text-gray-900">{org.name}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">{org.slug}</span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-600">
                                                    {(org.organization_members as unknown as { count: number }[])?.[0]?.count || 0}
                                                </span>
                                            </TableCell>
                                            <TableCell>
                                                <span className="text-sm text-gray-500">
                                                    {new Date(org.created_at).toLocaleDateString()}
                                                </span>
                                            </TableCell>
                                            <TableCell align="right">
                                                <div className="flex justify-end gap-3">
                                                    <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
                                                        Edit
                                                    </button>
                                                    <button className="text-sm text-red-600 hover:text-red-700 font-medium">
                                                        Delete
                                                    </button>
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
