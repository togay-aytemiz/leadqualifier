import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

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
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <div>
                    <div className="flex items-center gap-4 mb-2">
                        <Link href="/admin" className="text-zinc-400 hover:text-zinc-300">
                            ← Back
                        </Link>
                    </div>
                    <h1 className="text-3xl font-bold text-white">Organizations</h1>
                    <p className="mt-2 text-zinc-400">Manage all organizations in the system</p>
                </div>
            </div>

            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-zinc-800">
                        <tr>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Name</th>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Slug</th>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Members</th>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Created</th>
                            <th className="px-6 py-4 text-right text-sm font-medium text-zinc-300">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700/50">
                        {organizations?.map((org) => (
                            <tr key={org.id} className="hover:bg-zinc-700/20">
                                <td className="px-6 py-4">
                                    <span className="font-medium text-white">{org.name}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-zinc-400">{org.slug}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-zinc-300">
                                        {(org.organization_members as unknown as { count: number }[])?.[0]?.count || 0}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-zinc-400">
                                        {new Date(org.created_at).toLocaleDateString()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-sm text-blue-400 hover:text-blue-300 mr-3">
                                        Edit
                                    </button>
                                    <button className="text-sm text-red-400 hover:text-red-300">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {(!organizations || organizations.length === 0) && (
                    <div className="p-8 text-center text-zinc-500">No organizations found</div>
                )}
            </div>
        </div>
    )
}
