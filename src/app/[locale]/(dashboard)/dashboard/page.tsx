import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'

interface OrgData {
    name: string
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const t = await getTranslations('dashboard')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    // Get user's profile
    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    // Get user's organizations
    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, role, organizations(name)')
        .eq('user_id', user?.id)

    const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold text-white">{t('title')}</h1>
                <p className="mt-2 text-zinc-400">{t('welcome', { name: displayName })}</p>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                {/* Stats cards placeholder */}
                <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                    <h3 className="text-sm font-medium text-zinc-400">Organizations</h3>
                    <p className="mt-2 text-3xl font-bold text-white">{memberships?.length || 0}</p>
                </div>

                <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                    <h3 className="text-sm font-medium text-zinc-400">Leads</h3>
                    <p className="mt-2 text-3xl font-bold text-white">0</p>
                    <p className="mt-1 text-xs text-zinc-500">Coming in Phase 6</p>
                </div>

                <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                    <h3 className="text-sm font-medium text-zinc-400">Skills</h3>
                    <p className="mt-2 text-3xl font-bold text-white">0</p>
                    <p className="mt-1 text-xs text-zinc-500">Coming in Phase 3</p>
                </div>
            </div>

            {/* Organization list */}
            <div className="rounded-xl bg-zinc-800/50 p-6 border border-zinc-700/50">
                <h2 className="text-lg font-semibold text-white mb-4">Your Organizations</h2>
                {memberships && memberships.length > 0 ? (
                    <div className="space-y-3">
                        {memberships.map((m) => {
                            const org = m.organizations as unknown as OrgData | null
                            return (
                                <div
                                    key={m.organization_id}
                                    className="flex items-center justify-between rounded-lg bg-zinc-700/30 p-4"
                                >
                                    <div>
                                        <p className="font-medium text-white">
                                            {org?.name || 'Unknown'}
                                        </p>
                                        <p className="text-sm text-zinc-400 capitalize">{m.role}</p>
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                ) : (
                    <p className="text-zinc-500">No organizations yet. They will be created when you sign up with Supabase.</p>
                )}
            </div>
        </div>
    )
}
