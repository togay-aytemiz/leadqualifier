import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getLocale } from 'next-intl/server'

export default async function AdminPage() {
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

    // Get stats
    const { count: orgCount } = await supabase
        .from('organizations')
        .select('*', { count: 'exact', head: true })

    const { count: userCount } = await supabase
        .from('profiles')
        .select('*', { count: 'exact', head: true })

    const { count: skillCount } = await supabase
        .from('skills')
        .select('*', { count: 'exact', head: true })

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
                <p className="mt-2 text-zinc-400">System-wide overview and settings</p>
            </div>

            <div className="grid gap-6 md:grid-cols-3">
                <div className="rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-600/10 p-6 border border-purple-500/30">
                    <h3 className="text-sm font-medium text-purple-300">Total Organizations</h3>
                    <p className="mt-2 text-3xl font-bold text-white">{orgCount || 0}</p>
                </div>

                <div className="rounded-xl bg-gradient-to-br from-blue-500/20 to-blue-600/10 p-6 border border-blue-500/30">
                    <h3 className="text-sm font-medium text-blue-300">Total Users</h3>
                    <p className="mt-2 text-3xl font-bold text-white">{userCount || 0}</p>
                </div>

                <div className="rounded-xl bg-gradient-to-br from-green-500/20 to-green-600/10 p-6 border border-green-500/30">
                    <h3 className="text-sm font-medium text-green-300">Total Skills</h3>
                    <p className="mt-2 text-3xl font-bold text-white">{skillCount || 0}</p>
                </div>
            </div>

            <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
                <div className="grid gap-4 md:grid-cols-2">
                    <a
                        href="/admin/organizations"
                        className="flex items-center gap-4 p-4 rounded-lg bg-zinc-700/30 hover:bg-zinc-700/50 transition-colors"
                    >
                        <div className="p-3 rounded-lg bg-purple-500/20">
                            <svg className="w-6 h-6 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-medium text-white">Manage Organizations</p>
                            <p className="text-sm text-zinc-400">Create, edit, delete organizations</p>
                        </div>
                    </a>

                    <a
                        href="/admin/users"
                        className="flex items-center gap-4 p-4 rounded-lg bg-zinc-700/30 hover:bg-zinc-700/50 transition-colors"
                    >
                        <div className="p-3 rounded-lg bg-blue-500/20">
                            <svg className="w-6 h-6 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                            </svg>
                        </div>
                        <div>
                            <p className="font-medium text-white">Manage Users</p>
                            <p className="text-sm text-zinc-400">View and manage all users</p>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    )
}
