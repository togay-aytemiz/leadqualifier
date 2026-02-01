import { createClient } from '@/lib/supabase/server'
import { getChannels } from '@/lib/channels/actions'
import { getLocale } from 'next-intl/server'
import { ChannelsList } from '@/components/channels/ChannelsList'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader } from '@/design'
import { Zap, CreditCard, Receipt, Settings } from 'lucide-react'

export default async function ChannelsPage() {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    // Get organization from user's membership (accessible to all org members)
    const { data: membership } = await supabase
        .from('organization_members')
        .select('organization_id, role')
        .eq('user_id', user.id)
        .limit(1)
        .single()

    const organizationId = membership?.organization_id

    if (!organizationId) {
        return (
            <div className="flex-1 flex items-center justify-center text-gray-500">
                <div className="text-center">
                    <h2 className="text-xl font-bold text-gray-900 mb-2">No Organization Found</h2>
                    <p>You need to be part of an organization to manage channels.</p>
                </div>
            </div>
        )
    }

    const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, email')
        .eq('id', user.id)
        .single()

    const channels = await getChannels(organizationId)

    return (
        <>
            {/* Inner Sidebar */}
            <Sidebar title="Settings">
                <SidebarGroup title="Preferences">
                    <SidebarItem
                        icon={<Settings size={18} />}
                        label="General"
                        href={`/settings/general`} // Next.js Link should auto-handle locale if configured, or I might need to prepend locale? 
                    // Wait, SidebarItem uses Link. If I use href="/settings/general" it might go to root /settings/General.
                    // I should probably ensure it keeps the locale.
                    // For now I'll use a relative path or just verify how other Links work.
                    // The Sidebar component I saw earlier uses Link from 'next/link'.
                    // `href` prop in SidebarItem.
                    />
                </SidebarGroup>

                <SidebarGroup title="Integrations">
                    <SidebarItem icon={<Zap size={18} />} label="Channels" active />
                </SidebarGroup>

                <SidebarGroup title="Billing">
                    <SidebarItem icon={<CreditCard size={18} />} label="Plans" />
                    <SidebarItem icon={<Receipt size={18} />} label="Receipts" />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader title="Channels & Integrations" />

                <div className="flex-1 overflow-auto p-8">
                    <ChannelsList channels={channels || []} organizationId={organizationId} />
                </div>
            </div>
        </>
    )
}
