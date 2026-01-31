import { createClient } from '@/lib/supabase/server'
import { getTranslations } from 'next-intl/server'
import { redirect } from 'next/navigation'
import ChatSimulator from '@/components/chat/ChatSimulator'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader } from '@/design'

export default async function SimulatorPage() {
    const supabase = await createClient()
    const t = await getTranslations('common')

    const {
        data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
        redirect('/login')
    }

    const { data: memberships } = await supabase
        .from('organization_members')
        .select('organization_id, organizations(name)')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    if (!memberships || !memberships.organizations) {
        return (
            <div className="flex-1 flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900">No Organization Found</h2>
                    <p className="text-gray-500 mt-2">Please create an organization to use the simulator.</p>
                </div>
            </div>
        )
    }

    const org = memberships.organizations as unknown as { name: string }

    return (
        <>
            {/* Inner Sidebar */}
            <Sidebar title="Simulator">
                <SidebarGroup title="Testing">
                    <SidebarItem icon="chat_bubble" label="Chat Simulator" active />
                    <SidebarItem icon="play_circle" label="Scenarios" />
                    <SidebarItem icon="analytics" label="Logs" />
                </SidebarGroup>

                <SidebarGroup title="Navigation">
                    <SidebarItem icon="inbox" label="Go to Inbox" href="/inbox" />
                    <SidebarItem icon="settings" label="Channel Settings" href="/settings/channels" />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-gray-50 flex flex-col min-w-0 overflow-hidden">
                <PageHeader title="WhatsApp Simulator" />

                <div className="flex-1 overflow-auto p-8">
                    <div className="max-w-5xl mx-auto">
                        <p className="text-gray-500 mb-6">Test your conversational agent in a realistic environment. Messages here do not persist.</p>
                        <ChatSimulator
                            organizationId={memberships.organization_id}
                            organizationName={org.name}
                        />
                    </div>
                </div>
            </div>
        </>
    )
}
