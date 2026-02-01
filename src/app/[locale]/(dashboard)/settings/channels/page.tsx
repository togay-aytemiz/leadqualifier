import { createClient } from '@/lib/supabase/server'
import { getChannels } from '@/lib/channels/actions'
import { getLocale, getTranslations } from 'next-intl/server'
import { ChannelsList } from '@/components/channels/ChannelsList'
import { Sidebar, SidebarGroup, SidebarItem, PageHeader } from '@/design'
import { Zap, CreditCard, Receipt, Settings } from 'lucide-react'

export default async function ChannelsPage() {
    const supabase = await createClient()
    const locale = await getLocale()
    const tSidebar = await getTranslations('Sidebar')
    const tChannels = await getTranslations('Channels')

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
                    <h2 className="text-xl font-bold text-gray-900 mb-2">{tChannels('noOrganization')}</h2>
                    <p>{tChannels('noOrganizationDesc')}</p>
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
            <Sidebar title={tSidebar('settings')}>
                <SidebarGroup title={tSidebar('preferences')}>
                    <SidebarItem
                        icon={<Settings size={18} />}
                        label={tSidebar('general')}
                        href={locale === 'tr' ? '/settings/general' : `/${locale}/settings/general`}
                    />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('integrations')}>
                    <SidebarItem icon={<Zap size={18} />} label={tSidebar('channels')} active />
                </SidebarGroup>

                <SidebarGroup title={tSidebar('billing')}>
                    <SidebarItem icon={<CreditCard size={18} />} label={tSidebar('plans')} />
                    <SidebarItem icon={<Receipt size={18} />} label={tSidebar('receipts')} />
                </SidebarGroup>
            </Sidebar>

            {/* Main Content */}
            <div className="flex-1 bg-white flex flex-col min-w-0 overflow-hidden">
                <PageHeader title={tChannels('title')} />

                <div className="flex-1 overflow-auto p-8">
                    <ChannelsList channels={channels || []} organizationId={organizationId} />
                </div>
            </div>
        </>
    )
}
