import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'
import { Link } from '@/i18n/navigation'

export default async function AdminUsersPage() {
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

    // Get all users/profiles
    const { data: profiles } = await supabase
        .from('profiles')
        .select('*')
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
                    <h1 className="text-3xl font-bold text-white">Users</h1>
                    <p className="mt-2 text-zinc-400">Manage all users in the system</p>
                </div>
            </div>

            <div className="rounded-xl bg-zinc-800/50 border border-zinc-700/50 overflow-hidden">
                <table className="w-full">
                    <thead className="bg-zinc-800">
                        <tr>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Name</th>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Email</th>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Role</th>
                            <th className="px-6 py-4 text-left text-sm font-medium text-zinc-300">Created</th>
                            <th className="px-6 py-4 text-right text-sm font-medium text-zinc-300">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-700/50">
                        {profiles?.map((p) => (
                            <tr key={p.id} className="hover:bg-zinc-700/20">
                                <td className="px-6 py-4">
                                    <span className="font-medium text-white">{p.full_name || '-'}</span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-zinc-300">{p.email}</span>
                                </td>
                                <td className="px-6 py-4">
                                    {p.is_system_admin ? (
                                        <span className="px-2 py-1 text-xs bg-purple-500/20 text-purple-400 rounded-full">
                                            System Admin
                                        </span>
                                    ) : (
                                        <span className="px-2 py-1 text-xs bg-zinc-600/50 text-zinc-400 rounded-full">
                                            User
                                        </span>
                                    )}
                                </td>
                                <td className="px-6 py-4">
                                    <span className="text-sm text-zinc-400">
                                        {new Date(p.created_at).toLocaleDateString()}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right">
                                    <button className="text-sm text-blue-400 hover:text-blue-300 mr-3">
                                        Edit
                                    </button>
                                    {!p.is_system_admin && (
                                        <button className="text-sm text-purple-400 hover:text-purple-300">
                                            Make Admin
                                        </button>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {(!profiles || profiles.length === 0) && (
                    <div className="p-8 text-center text-zinc-500">No users found</div>
                )}
            </div>
        </div>
    )
}
