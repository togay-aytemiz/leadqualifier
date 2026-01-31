import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader, Badge, StatCard } from '@/design'

interface OrgData {
    name: string
}

export default async function DashboardPage() {
    const supabase = await createClient()
    const t = await getTranslations('dashboard')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user?.id)
        .single()

    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, role, organizations(name)')
        .eq('user_id', user?.id)

    const displayName = profile?.full_name || user?.email?.split('@')[0] || 'User'

    return (
        <>
            {/* Inner Sidebar */}
            <Sidebar title="Overview">
                <SidebarGroup>
                    <SidebarItem icon="inbox" label="Your Inbox" count={5} active />
                    <SidebarItem icon="alternate_email" label="Mentions" count={2} />
                    <SidebarItem icon="edit" label="Created by you" count={6} />
                </SidebarGroup>

                <SidebarGroup title="Teams">
                    <SidebarItem icon="group" label="Unassigned" count={8} />
                    <SidebarItem icon="support_agent" label="Support Team" count={12} />
                </SidebarGroup>

                <SidebarGroup title="Views">
                    <SidebarItem icon="warning" iconColor="text-yellow-500" label="Waiting premium" count={6} />
                    <SidebarItem icon="mail" iconColor="text-blue-400" label="Emails" count={21} />
                    <SidebarItem icon="call" iconColor="text-red-400" label="Calls in progress" count={16} />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader title={t('title')} />

                <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-6xl mx-auto space-y-8">
                        <div>
                            <p className="text-gray-500">{t('welcome', { name: displayName })}</p>
                        </div>

                        {/* Stats Cards */}
                        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
                            <StatCard
                                icon="inbox"
                                iconColor="blue"
                                title="Active Conversations"
                                value={0}
                                href="/inbox"
                            />
                            <StatCard
                                icon="auto_awesome"
                                iconColor="purple"
                                title="Skills"
                                value={0}
                                href="/skills"
                            />
                            <StatCard
                                icon="people"
                                iconColor="green"
                                title="Organizations"
                                value={memberships?.length || 0}
                            />
                        </div>

                        {/* Organization List */}
                        <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
                                <h2 className="font-semibold text-gray-900">Your Organizations</h2>
                            </div>

                            {memberships && memberships.length > 0 ? (
                                <div className="divide-y divide-gray-100">
                                    {memberships.map((m) => {
                                        const org = m.organizations as unknown as OrgData | null
                                        return (
                                            <div
                                                key={m.organization_id}
                                                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
                                            >
                                                <div className="flex items-center gap-4">
                                                    <div className="h-10 w-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-600 font-bold text-sm">
                                                        {org?.name?.charAt(0).toUpperCase() || 'O'}
                                                    </div>
                                                    <div>
                                                        <p className="font-medium text-gray-900">
                                                            {org?.name || 'Unknown'}
                                                        </p>
                                                        <p className="text-sm text-gray-500 capitalize">{m.role}</p>
                                                    </div>
                                                </div>
                                                <Badge variant="neutral">{m.role}</Badge>
                                            </div>
                                        )
                                    })}
                                </div>
                            ) : (
                                <div className="p-8 text-center text-gray-500">
                                    No organizations yet. Create one to get started.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}
